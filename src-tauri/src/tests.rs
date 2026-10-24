use crate::store::{Store,validate};
use serde_json::{json,Value};
use std::{fs,path::PathBuf};
struct TestLibrary { base:PathBuf,store:Store }
impl TestLibrary {
    fn new()->Self {
        let base=std::env::temp_dir().join(format!("qingtu-test-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&base).unwrap();let mut store=Store::new(base.join("settings.json")).unwrap();
        store.initialize(&base.join("library")).unwrap();Self{base,store}
    }
}
impl Drop for TestLibrary {
    fn drop(&mut self){self.store.connection=None;
        if self.base.parent()==Some(std::env::temp_dir().as_path())&&self.base.file_name().unwrap().to_string_lossy().starts_with("qingtu-test-"){let _=fs::remove_dir_all(&self.base);}}
}
fn document()->Value {json!({"id":"document-1","schemaVersion":1,"title":"测试文档","rootId":"root","revision":0,"layoutMode":"auto","viewport":{"x":0,"y":0,"zoom":1},"updatedAt":0,
    "nodes":{"root":{"id":"root","kind":"text","parentId":null,"childIds":[],"title":"学习","body":{"type":"doc","content":[{"type":"paragraph"}]},"side":"right","color":"teal","position":{"x":0,"y":0},"contentCollapsed":false,"childrenCollapsed":false}}})}
fn patch(doc:&Value,revision:i64,command:&str)->Value {
    json!({"document":doc,"upserts":doc["nodes"].as_object().unwrap().values().collect::<Vec<_>>(),"removedIds":[],"baseRevision":revision,"commandId":command})
}
#[test]
fn formatted_tables_and_code_survive_save_restart_and_project_roundtrip() {
    let mut t=TestLibrary::new();let mut doc=document();doc["nodes"]["root"]["kind"]=json!("card");
    let cell=|kind:&str,text:&str|json!({"type":kind,"attrs":{"colspan":1,"rowspan":1,"colwidth":null,"align":"right"},"content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]});
    doc["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"codeBlock","attrs":{"language":"python"},"content":[{"type":"text","text":"def hello():\n    return '$literal$'"}]},{"type":"table","content":[{"type":"tableRow","content":[cell("tableHeader","名称"),cell("tableHeader","值")]},{"type":"tableRow","content":[cell("tableCell","甲"),cell("tableCell","42")]}]}]});
    t.store.save(patch(&doc,0,"formatted-save")).unwrap();let reopened=Store::new(t.base.join("settings.json")).unwrap();assert_eq!(reopened.load("document-1").unwrap()["nodes"],doc["nodes"]);drop(reopened);
    let project=t.base.join("formatted.qmap");t.store.export_project("document-1",&project).unwrap();let mut other=TestLibrary::new();assert_eq!(other.store.import_project(&project).unwrap()["nodes"],doc["nodes"]);
    let mut invalid=doc.clone();invalid["nodes"]["root"]["body"]["content"][1]["content"][0]["content"][0]["attrs"]["colspan"]=json!(100000);assert!(validate(&invalid).is_err());
}
#[test]
fn workspace_survives_restart_migration_and_rejects_invalid_references() {
    let mut t=TestLibrary::new();let doc=document();t.store.save(patch(&doc,0,"workspace-doc")).unwrap();
    let workspace=json!({"folders":[{"id":"folder-1","name":"读论文"}],"documentFolders":{"document-1":"folder-1"},"openIds":["document-1"]});
    t.store.set_workspace(workspace.clone()).unwrap();
    let reopened=Store::new(t.base.join("settings.json")).unwrap();assert_eq!(reopened.info().unwrap()["workspace"],workspace);drop(reopened);
    let mut invalid=workspace.clone();invalid["documentFolders"]["document-1"]=json!("missing");assert!(t.store.set_workspace(invalid).is_err());assert_eq!(t.store.workspace().unwrap(),workspace);
    t.store.migrate(&t.base.join("migrated")).unwrap();assert_eq!(t.store.workspace().unwrap(),workspace);
    let reopened=Store::new(t.base.join("settings.json")).unwrap();assert_eq!(reopened.workspace().unwrap(),workspace);
    let closed=json!({"folders":workspace["folders"],"documentFolders":workspace["documentFolders"],"openIds":[]});
    reopened.set_workspace(closed).unwrap();assert_eq!(reopened.load("document-1").unwrap()["nodes"],doc["nodes"]);
}
#[test]
fn deleting_document_cleans_tabs_atomically_and_preserves_other_documents_and_assets() {
    let mut t=TestLibrary::new();let image=t.base.join("shared.png");fs::write(&image,include_bytes!("../../public/demo/triangle.png")).unwrap();let asset=t.store.import_asset(&image).unwrap();
    let mut doc=document();doc["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"assetImage","attrs":{"assetId":asset["id"]}}]});
    let mut other=doc.clone();other["id"]=json!("other");t.store.save(patch(&doc,0,"delete-a")).unwrap();t.store.save(patch(&other,0,"delete-b")).unwrap();
    let workspace=json!({"folders":[{"id":"f","name":"论文"}],"documentFolders":{"document-1":"f","other":"f"},"openIds":["document-1","other"]});t.store.set_workspace(workspace.clone()).unwrap();
    t.store.db().unwrap().execute_batch("CREATE TRIGGER reject_workspace BEFORE UPDATE ON workspace BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;").unwrap();
    assert!(t.store.delete_document("document-1").is_err());assert_eq!(t.store.load("document-1").unwrap()["nodes"],doc["nodes"]);assert_eq!(t.store.workspace().unwrap(),workspace);
    t.store.db().unwrap().execute_batch("DROP TRIGGER reject_workspace;").unwrap();t.store.delete_document("document-1").unwrap();
    assert!(t.store.load("document-1").is_err());assert_eq!(t.store.load("other").unwrap()["nodes"],other["nodes"]);
    assert_eq!(t.store.workspace().unwrap()["openIds"],json!(["other"]));assert!(t.store.workspace().unwrap()["documentFolders"].get("document-1").is_none());assert!(t.store.root().unwrap().join(asset["relativePath"].as_str().unwrap()).is_file());
    for table in ["nodes","revisions","commands"]{let count:i64=t.store.db().unwrap().query_row(&format!("SELECT COUNT(*) FROM {table} WHERE doc_id='document-1'"),[],|r|r.get(0)).unwrap();assert_eq!(count,0);}
    let reopened=Store::new(t.base.join("settings.json")).unwrap();assert!(reopened.load("document-1").is_err());assert_eq!(reopened.workspace().unwrap()["openIds"],json!(["other"]));assert_eq!(reopened.info().unwrap()["documents"].as_array().unwrap().len(),1);
}
#[test]
fn save_reopen_and_duplicate_command_are_consistent() {
    let mut t=TestLibrary::new();let doc=document();
    let first=t.store.save(patch(&doc,0,"c1")).unwrap();assert_eq!(first["revision"],1);
    assert_eq!(t.store.save(patch(&doc,0,"c1")).unwrap()["revision"],1);
    assert!(t.store.save(patch(&doc,0,"c2")).is_err());
    let loaded=t.store.load("document-1").unwrap();assert_eq!(loaded["nodes"],doc["nodes"]);
    let reopened=Store::new(t.base.join("settings.json")).unwrap();assert_eq!(reopened.load("document-1").unwrap(),loaded);
}
#[test]
fn invalid_patch_does_not_replace_saved_document() {
    let mut t=TestLibrary::new();let doc=document();t.store.save(patch(&doc,0,"c1")).unwrap();
    let before=t.store.load("document-1").unwrap();let mut invalid=doc.clone();invalid["nodes"]["root"]["childIds"]=json!(["missing"]);
    assert!(t.store.save(patch(&invalid,1,"c2")).is_err());assert_eq!(t.store.load("document-1").unwrap(),before);
}
#[test]
fn media_deduplication_and_project_roundtrip() {
    let mut t=TestLibrary::new();let image=t.base.join("测试 图片.png");fs::write(&image,include_bytes!("../../public/demo/triangle.png")).unwrap();
    let a=t.store.import_asset(&image).unwrap();let b=t.store.import_asset(&image).unwrap();assert_eq!(a["id"],b["id"]);
    let mut doc=document();doc["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"assetImage","attrs":{"assetId":a["id"]}}]});
    t.store.save(patch(&doc,0,"c1")).unwrap();let project=t.base.join("备份 项目.qmap");t.store.export_project("document-1",&project).unwrap();
    let mut other=TestLibrary::new();let imported=other.store.import_project(&project).unwrap();
    assert_eq!(imported["nodes"],doc["nodes"]);assert_ne!(imported["id"],doc["id"]);
    assert_eq!(other.store.info().unwrap()["assets"].as_array().unwrap().len(),1);
}
#[test]
fn clipboard_image_is_persisted_deduplicated_and_exported() {
    let mut t=TestLibrary::new();let bytes=include_bytes!("../../public/demo/triangle.png");
    let asset=t.store.import_image_bytes(bytes,"截图.png").unwrap();
    let duplicate=t.store.import_image_bytes(bytes,"截图.png").unwrap();
    assert_eq!(asset["id"],duplicate["id"]);assert_eq!(asset["name"],"截图.png");
    crate::assets::validate_asset(&asset).unwrap();
    assert!(t.store.root().unwrap().join(asset["relativePath"].as_str().unwrap()).is_file());
    assert!(t.store.root().unwrap().join(asset["thumbnailPath"].as_str().unwrap()).is_file());
    assert!(!fs::read_dir(t.store.root().unwrap().join("assets")).unwrap().any(|entry|entry.unwrap().file_name().to_string_lossy().starts_with(".clipboard-")));
    let mut doc=document();doc["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"assetImage","attrs":{"assetId":asset["id"]}}]});
    t.store.save(patch(&doc,0,"clipboard")).unwrap();let project=t.base.join("clipboard.qmap");t.store.export_project("document-1",&project).unwrap();
    let mut other=TestLibrary::new();let imported=other.store.import_project(&project).unwrap();assert_eq!(imported["nodes"],doc["nodes"]);
    assert_eq!(other.store.info().unwrap()["assets"][0]["sha256"],asset["sha256"]);
}
#[test]
fn invalid_clipboard_images_do_not_create_assets() {
    let t=TestLibrary::new();
    for bytes in [b"".as_slice(),b"not an image".as_slice(),b"GIF89a".as_slice(),&vec![0u8;10*1024*1024+1]] {
        assert!(t.store.import_image_bytes(bytes,"image.png").is_err());
    }
    assert_eq!(t.store.info().unwrap()["assets"].as_array().unwrap().len(),0);
}
#[test]
fn default_node_kind_survives_reopen_and_migration_without_changing_documents() {
    let mut t=TestLibrary::new();let doc=document();t.store.save(patch(&doc,0,"preference")).unwrap();let original=t.store.load("document-1").unwrap();
    for kind in ["text","card","image","video"] {t.store.set_default_node_kind(Some(kind.into())).unwrap();assert_eq!(t.store.info().unwrap()["defaultNodeKind"],kind);}
    t.store.set_default_node_kind(Some("card".into())).unwrap();
    let reopened=Store::new(t.base.join("settings.json")).unwrap();assert_eq!(reopened.info().unwrap()["defaultNodeKind"],"card");drop(reopened);
    t.store.migrate(&t.base.join("moved")).unwrap();assert_eq!(t.store.info().unwrap()["defaultNodeKind"],"card");
    assert_eq!(t.store.load("document-1").unwrap(),original);
    let settings_before=fs::read(t.base.join("settings.json")).unwrap();assert!(t.store.set_default_node_kind(Some("unknown".into())).is_err());assert_eq!(fs::read(t.base.join("settings.json")).unwrap(),settings_before);
    t.store.set_default_node_kind(None).unwrap();let reopened=Store::new(t.base.join("settings.json")).unwrap();assert!(reopened.info().unwrap()["defaultNodeKind"].is_null());
}
#[test]
fn old_settings_remain_compatible_and_failed_preference_write_preserves_memory() {
    let mut t=TestLibrary::new();let settings=json!({"storagePath":t.store.root().unwrap(),"recentId":null});
    let legacy=t.base.join("legacy.json");crate::store::atomic_write(&legacy,&serde_json::to_vec(&settings).unwrap()).unwrap();
    let reopened=Store::new(legacy).unwrap();assert!(reopened.info().unwrap()["defaultNodeKind"].is_null());drop(reopened);
    let blocked=t.base.join("directory-not-file");fs::create_dir(&blocked).unwrap();t.store.config_path=blocked;
    assert!(t.store.set_default_node_kind(Some("card".into())).is_err());assert!(t.store.info().unwrap()["defaultNodeKind"].is_null());
}
#[test]
fn shared_parent_connections_save_export_and_reject_cycles() {
    let mut t=TestLibrary::new();let mut doc=document();let root=doc["nodes"]["root"].clone();
    for (id,parent,children) in [("a","root",vec!["shared"]),("b","root",vec![]),("shared","a",vec![])]{
        let mut node=root.clone();node["id"]=json!(id);node["parentId"]=json!(parent);node["childIds"]=json!(children);doc["nodes"][id]=node;
    }
    doc["nodes"]["root"]["childIds"]=json!(["a","b"]);doc["nodes"]["shared"]["extraParentIds"]=json!(["b"]);
    t.store.save(patch(&doc,0,"shared")).unwrap();let saved=t.store.load("document-1").unwrap();assert_eq!(saved["nodes"],doc["nodes"]);
    let project=t.base.join("shared.qmap");t.store.export_project("document-1",&project).unwrap();let mut other=TestLibrary::new();assert_eq!(other.store.import_project(&project).unwrap()["nodes"],doc["nodes"]);
    for bad in [json!(["shared"]),json!(["root","root"]),json!(["missing"]),json!(null)]{let mut invalid=doc.clone();invalid["nodes"]["a"]["extraParentIds"]=bad;assert!(validate(&invalid).is_err());}
    let mut root_parent=doc.clone();root_parent["nodes"]["root"]["extraParentIds"]=json!(["b"]);assert!(validate(&root_parent).is_err());
}
#[test]
fn dropped_video_bytes_are_persisted_deduplicated_and_exported() {
    let mut t=TestLibrary::new();let bytes=include_bytes!("../../public/demo/lesson.mp4");
    let asset=t.store.import_video_bytes(bytes,"拖入 视频.mp4").unwrap();let duplicate=t.store.import_video_bytes(bytes,"拖入 视频.mp4").unwrap();assert_eq!(asset["id"],duplicate["id"]);assert_eq!(asset["name"],"拖入 视频.mp4");
    assert_eq!(asset["mime"],"video/mp4");assert!(t.store.import_video_bytes(b"not mp4","bad.mp4").is_err());
    let mut doc=document();doc["nodes"]["root"]["kind"]=json!("card");doc["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"video","attrs":{"assetId":asset["id"]}}]});
    t.store.save(patch(&doc,0,"video")).unwrap();let project=t.base.join("video.qmap");t.store.export_project("document-1",&project).unwrap();let mut other=TestLibrary::new();assert_eq!(other.store.import_project(&project).unwrap()["nodes"],doc["nodes"]);
}
#[test]
fn custom_storage_migration_preserves_source_and_reopens_target() {
    let mut t=TestLibrary::new();let doc=document();t.store.save(patch(&doc,0,"c1")).unwrap();
    let source=t.store.root().unwrap().to_path_buf();let dest=t.base.join("自定义位置");
    t.store.migrate(&dest).unwrap();assert_eq!(t.store.root().unwrap(),dest.canonicalize().unwrap());assert!(source.join("library.sqlite3").is_file());
    let reopened=Store::new(t.base.join("settings.json")).unwrap();assert_eq!(reopened.load("document-1").unwrap()["nodes"],doc["nodes"]);
    assert!(t.store.migrate(&dest.join("nested")).is_err());
}
#[test]
fn malformed_archive_does_not_change_document_count() {
    let mut t=TestLibrary::new();let path=t.base.join("bad.qmap");fs::write(&path,b"not a zip").unwrap();
    assert!(t.store.import_project(&path).is_err());assert_eq!(t.store.info().unwrap()["documents"].as_array().unwrap().len(),0);
}
#[test]
fn cycles_and_unsupported_versions_are_rejected() {
    let mut doc=document();doc["schemaVersion"]=json!(2);assert!(validate(&doc).is_err());
    doc["schemaVersion"]=json!(1);doc["nodes"]["root"]["childIds"]=json!(["root"]);assert!(validate(&doc).is_err());
}
#[test]
fn invalid_asset_paths_and_nested_columns_are_rejected() {
    let hash="a".repeat(64);
    let malicious=json!({"id":hash,"sha256":hash,"mime":"image/png","relativePath":"../../outside.png","byteSize":100,"width":1,"height":1});
    assert!(crate::assets::validate_asset(&malicious).is_err());
    let mut doc=document();doc["nodes"]["root"]["kind"]=json!("card");
    doc["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"columns","attrs":{"ratio":"3:2"},"content":[{"type":"column","content":[{"type":"columns","attrs":{"ratio":"1:1"},"content":[{"type":"column"},{"type":"column"}]}]},{"type":"column"}]}]});
    assert!(validate(&doc).is_err());
}
#[test]
fn forged_manifest_rolls_back_database_and_files() {
    use std::io::{Read,Write};
    let mut source=TestLibrary::new();let image=source.base.join("image.png");fs::write(&image,include_bytes!("../../public/demo/triangle.png")).unwrap();
    let asset=source.store.import_asset(&image).unwrap();let mut doc=document();doc["nodes"]["root"]["assetId"]=asset["id"].clone();source.store.save(patch(&doc,0,"seed")).unwrap();
    let good=source.base.join("good.qmap");source.store.export_project("document-1",&good).unwrap();
    let bad=source.base.join("bad.qmap");let mut archive=zip::ZipArchive::new(fs::File::open(good).unwrap()).unwrap();let mut output=zip::ZipWriter::new(fs::File::create(&bad).unwrap());
    for i in 0..archive.len(){let mut entry=archive.by_index(i).unwrap();let name=entry.name().to_owned();let mut bytes=Vec::new();entry.read_to_end(&mut bytes).unwrap();
        if name=="manifest.json"{let mut value:Value=serde_json::from_slice(&bytes).unwrap();value["assets"][0]["relativePath"]=json!("document.json");bytes=serde_json::to_vec(&value).unwrap();}
        output.start_file(name,zip::write::SimpleFileOptions::default()).unwrap();output.write_all(&bytes).unwrap();}
    output.finish().unwrap();
    let mut target=TestLibrary::new();target.store.save(patch(&document(),0,"existing")).unwrap();let before=target.store.info().unwrap();
    assert!(target.store.import_project(&bad).is_err());let after=target.store.info().unwrap();
    assert_eq!(before["documents"],after["documents"]);assert_eq!(before["assets"],after["assets"]);
    assert!(!target.store.root().unwrap().join("document.json").exists());assert_eq!(fs::read_dir(target.store.root().unwrap().join("assets")).unwrap().count(),0);
}

fn verify_recovery_export(t:&TestLibrary,unsaved:&Value){
    let file=t.base.join("保存失败后的完整备份.qmap");t.store.export_snapshot(unsaved,&file).unwrap();
    let mut restored=TestLibrary::new();let imported=restored.store.import_project(&file).unwrap();
    assert_eq!(imported["nodes"],unsaved["nodes"]);assert_eq!(imported["title"],unsaved["title"]);
}
#[test]
fn readonly_database_preserves_saved_data_and_allows_unsaved_export(){
    for _ in 0..5{
        let mut t=TestLibrary::new();t.store.save(patch(&document(),0,"seed")).unwrap();let before=t.store.load("document-1").unwrap();
        let file=t.store.root().unwrap().join("library.sqlite3");t.store.connection=None;
        t.store.connection=Some(rusqlite::Connection::open_with_flags(file,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap());
        let mut unsaved=before.clone();unsaved["nodes"]["root"]["title"]=json!("只读状态下仍可恢复的修改");
        assert!(t.store.save(patch(&unsaved,1,"write-readonly")).is_err());assert_eq!(t.store.load("document-1").unwrap(),before);
        verify_recovery_export(&t,&unsaved);
    }
}
#[test]
fn sqlite_full_rolls_back_revision_and_allows_external_recovery_export(){
    for _ in 0..5{
        let mut t=TestLibrary::new();t.store.save(patch(&document(),0,"seed")).unwrap();let before=t.store.load("document-1").unwrap();
        let pages:i64=t.store.db().unwrap().query_row("PRAGMA page_count",[],|r|r.get(0)).unwrap();
        t.store.db().unwrap().execute_batch(&format!("PRAGMA max_page_count={pages}")).unwrap();
        let mut unsaved=before.clone();unsaved["nodes"]["root"]["kind"]=json!("card");
        unsaved["nodes"]["root"]["body"]=json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"a".repeat(19000)}]}]});
        let error=t.store.save(patch(&unsaved,1,"write-full")).unwrap_err();assert!(error.contains("full"),"{error}");
        assert_eq!(t.store.load("document-1").unwrap(),before);verify_recovery_export(&t,&unsaved);
    }
}
#[test]
fn writer_lock_timeout_preserves_revision_and_allows_snapshot_export(){
    for _ in 0..5{
        let mut t=TestLibrary::new();t.store.save(patch(&document(),0,"seed")).unwrap();let before=t.store.load("document-1").unwrap();
        let other=rusqlite::Connection::open(t.store.root().unwrap().join("library.sqlite3")).unwrap();other.execute_batch("BEGIN IMMEDIATE").unwrap();
        let mut unsaved=before.clone();unsaved["nodes"]["root"]["title"]=json!("锁超时后的未保存修改");
        let error=t.store.save(patch(&unsaved,1,"write-locked")).unwrap_err();assert!(error.contains("locked"),"{error}");
        assert_eq!(t.store.load("document-1").unwrap(),before);verify_recovery_export(&t,&unsaved);
        other.execute_batch("ROLLBACK").unwrap();t.store.save(patch(&unsaved,1,"write-retry")).unwrap();assert_eq!(t.store.load("document-1").unwrap()["nodes"],unsaved["nodes"]);
    }
}
#[test]
fn missing_or_corrupted_media_never_produces_claimed_complete_backup(){
    for corrupt in [false,true]{for _ in 0..5{
        let mut t=TestLibrary::new();let file=t.base.join("媒体.png");fs::write(&file,include_bytes!("../../public/demo/triangle.png")).unwrap();let asset=t.store.import_asset(&file).unwrap();
        let mut doc=document();doc["nodes"]["root"]["assetId"]=asset["id"].clone();t.store.save(patch(&doc,0,"seed")).unwrap();
        let original=t.store.load("document-1").unwrap();let asset_file=t.store.asset_path(asset["id"].as_str().unwrap(),false).unwrap();
        if corrupt{fs::write(asset_file,b"damaged").unwrap();}else{fs::remove_file(asset_file).unwrap();}
        assert!(t.store.export_snapshot(&doc,&t.base.join("不完整项目.qmap")).is_err());
        assert!(!t.base.join("不完整项目.qmap").exists());assert_eq!(t.store.load("document-1").unwrap(),original);
    }}
}

#[test]
fn detailed_transparent_thumbnails_stay_within_size_and_dimension_limits(){
    let mut seed=20261015u32;
    let mut pixels=image::RgbaImage::new(1024,768);
    for pixel in pixels.pixels_mut(){seed=seed.wrapping_mul(1664525).wrapping_add(1013904223);*pixel=image::Rgba([(seed>>24) as u8,(seed>>16) as u8,(seed>>8) as u8,if seed%2==0{0}else{200}]);}
    let source=image::DynamicImage::ImageRgba8(pixels);let bytes=crate::assets::thumbnail_bytes(&source).unwrap();
    assert!(bytes.len()<=200*1024);let decoded=image::load_from_memory(&bytes).unwrap();assert!(decoded.width()<=512&&decoded.height()<=512);
    assert!(decoded.to_rgba8().pixels().any(|p|p[3]<255));
}
