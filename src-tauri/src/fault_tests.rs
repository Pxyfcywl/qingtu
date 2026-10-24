use crate::store::{Store,atomic_write};
use serde_json::{json,Value};
use std::{fs,path::PathBuf,process::{Command,Stdio}};

struct Fixture { base:PathBuf,original:Value,asset:Value }
fn patch(doc:&Value,revision:u64)->Value {
    json!({"document":doc,"upserts":doc["nodes"].as_object().unwrap().values().collect::<Vec<_>>(),"removedIds":if revision==1{vec!["old"]}else{vec![]},"baseRevision":revision,"commandId":format!("command-{revision}")})
}
impl Fixture {
    fn new()->Self {
        let base=std::env::temp_dir().join(format!("qingtu-fault-{}",uuid::Uuid::new_v4()));fs::create_dir(&base).unwrap();
        let mut store=Store::new(base.join("settings.json")).unwrap();store.initialize(&base.join("library")).unwrap();
        let image=base.join("old.png");fs::write(&image,include_bytes!("../../public/demo/triangle.png")).unwrap();let asset=store.import_asset(&image).unwrap();
        fs::write(base.join("new.png"),include_bytes!("../../public/demo/geometry.png")).unwrap();
        let root=json!({"id":"root","kind":"card","parentId":null,"childIds":["old"],"title":"已保存的旧版本","body":{"type":"doc","content":[{"type":"assetImage","attrs":{"assetId":asset["id"]}}]},"position":{"x":0,"y":0},"side":"right","color":"teal","contentCollapsed":false,"childrenCollapsed":false});
        let mut old=root.clone();old["id"]=json!("old");old["parentId"]=json!("root");old["childIds"]=json!([]);old["kind"]=json!("text");old["title"]=json!("旧节点");
        let doc=json!({"id":"fault-doc","schemaVersion":1,"title":"旧版本","rootId":"root","revision":0,"layoutMode":"auto","viewport":{"x":0,"y":0,"zoom":1},"updatedAt":0,"nodes":{"root":root,"old":old}});
        store.save(patch(&doc,0)).unwrap();let original=store.load("fault-doc").unwrap();
        let mut next=original.clone();next["title"]=json!("新版本");next["nodes"]["root"]["title"]=json!("原子保存的新版本");next["nodes"]["root"]["childIds"]=json!(["new"]);
        let mut new=next["nodes"]["old"].take();new["id"]=json!("new");new["title"]=json!("新节点");next["nodes"].as_object_mut().unwrap().remove("old");next["nodes"]["new"]=new;
        fs::write(base.join("next.json"),serde_json::to_vec(&next).unwrap()).unwrap();
        Self{base,original,asset}
    }
    fn open(&self)->Store{Store::new(self.base.join("settings.json")).unwrap()}
    fn terminate(&self,operation:&str,point:&str){
        let output=Command::new(std::env::current_exe().unwrap()).args(["--ignored","--exact","fault_tests::crash_worker","--nocapture"])
            .env("QINGTU_FAULT_ROOT",&self.base).env("QINGTU_FAULT_OPERATION",operation).env("QINGTU_TEST_FAULT",point)
            .stdin(Stdio::null()).output().unwrap();
        assert_eq!(output.status.code(),Some(137),"Checkpoint {point} not reached: {}",String::from_utf8_lossy(&output.stderr));
        assert!(String::from_utf8_lossy(&output.stderr).contains(point));
    }
    fn check_integrity(&self,store:&Store){
        let integrity:String=store.db().unwrap().query_row("PRAGMA integrity_check",[],|r|r.get(0)).unwrap();assert_eq!(integrity,"ok");
        assert!(store.asset_path(self.asset["id"].as_str().unwrap(),false).unwrap().is_file());
    }
}
impl Drop for Fixture {
    fn drop(&mut self){
        if self.base.parent()==Some(std::env::temp_dir().as_path())&&self.base.file_name().unwrap().to_string_lossy().starts_with("qingtu-fault-"){let _=fs::remove_dir_all(&self.base);}
    }
}
fn record(name:&str,samples:Vec<Value>){
    if let Some(dir)=std::env::var_os("QINGTU_FAULT_REPORT_DIR"){
        let dir=PathBuf::from(dir);fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(format!("{name}.json")),serde_json::to_vec_pretty(&json!({"scenario":name,"status":"passed","count":samples.len(),"samples":samples,"method":"Test-only checkpoint invokes Windows TerminateProcess(137); no Rust destructors run. Does not simulate OS power loss."})).unwrap()).unwrap();
    }
}

#[test]
#[ignore = "subprocess worker selected explicitly by the fault matrix"]
fn crash_worker(){
    let base=PathBuf::from(std::env::var_os("QINGTU_FAULT_ROOT").expect("worker root required"));
    assert_eq!(base.parent(),Some(std::env::temp_dir().as_path()));assert!(base.file_name().unwrap().to_string_lossy().starts_with("qingtu-fault-"));
    let mut store=Store::new(base.join("settings.json")).unwrap();
    match std::env::var("QINGTU_FAULT_OPERATION").unwrap().as_str(){
        "save"=>{let doc=serde_json::from_slice(&fs::read(base.join("next.json")).unwrap()).unwrap();store.save(patch(&doc,1)).unwrap();},
        "asset"=>{store.import_asset(&base.join("new.png")).unwrap();},
        "atomic"=>{atomic_write(&base.join("atomic.json"),br#"{"version":"new"}"#).unwrap();},
        "export"=>{store.export_project("fault-doc",&base.join("overwrite.qmap")).unwrap();},
        "migration"=>{store.migrate(&base.join("迁移目标")).unwrap();},
        _=>panic!("Unknown worker operation")
    }
    panic!("Worker did not terminate at requested checkpoint");
}

#[test]
fn interrupted_transactions_recover_only_complete_revisions(){
    let mut samples=Vec::new();
    for point in ["save_before_transaction","save_after_metadata","save_after_nodes","save_after_commit"]{for iteration in 1..=10{
        let fixture=Fixture::new();fixture.terminate("save",point);let recovered=fixture.open();fixture.check_integrity(&recovered);
        let doc=recovered.load("fault-doc").unwrap();let revision=if point=="save_after_commit"{2}else{1};assert_eq!(doc["revision"],revision);
        let expected=if revision==1{fixture.original.clone()}else{serde_json::from_slice::<Value>(&fs::read(fixture.base.join("next.json")).unwrap()).unwrap()};
        assert_eq!(doc["nodes"],expected["nodes"]);assert_eq!(doc["title"],expected["title"]);
        samples.push(json!({"point":point,"iteration":iteration,"recoveredRevision":revision}));
    }}
    record("sqlite-interruption",samples);
}

#[test]
fn interrupted_asset_import_never_commits_missing_files(){
    let mut samples=Vec::new();
    for point in ["asset_copy_chunk","asset_before_publish","asset_after_publish","asset_after_commit"]{for iteration in 1..=10{
        let fixture=Fixture::new();fixture.terminate("asset",point);let recovered=fixture.open();fixture.check_integrity(&recovered);
        assert_eq!(recovered.load("fault-doc").unwrap(),fixture.original);
        let info=recovered.info().unwrap();let assets=info["assets"].as_array().unwrap();assert_eq!(assets.len(),if point=="asset_after_commit"{2}else{1});
        for asset in assets{let file=recovered.asset_path(asset["id"].as_str().unwrap(),false).unwrap();assert_eq!(crate::assets::hash_file(&file).unwrap(),asset["sha256"].as_str().unwrap());}
        samples.push(json!({"point":point,"iteration":iteration,"committedAssets":assets.len()}));
    }}
    record("asset-interruption",samples);
}

#[test]
fn interrupted_settings_replacement_never_removes_destination(){
    let mut samples=Vec::new();
    for point in ["file_before_replace","file_after_replace"]{for iteration in 1..=10{
        let fixture=Fixture::new();fs::write(fixture.base.join("atomic.json"),br#"{"version":"old"}"#).unwrap();
        fixture.terminate("atomic",point);
        let recovered:Value=serde_json::from_slice(&fs::read(fixture.base.join("atomic.json")).unwrap()).unwrap();
        assert_eq!(recovered["version"],if point=="file_before_replace"{"old"}else{"new"});
        samples.push(json!({"point":point,"iteration":iteration,"version":recovered["version"]}));
    }}
    record("settings-replacement",samples);
}

#[test]
fn interrupted_project_overwrite_keeps_complete_archive(){
    use std::io::Read;use sha2::{Digest,Sha256};
    let mut samples=Vec::new();
    for point in ["file_before_replace","file_after_replace"]{for iteration in 1..=10{
        let fixture=Fixture::new();{
            let mut store=fixture.open();store.export_project("fault-doc",&fixture.base.join("overwrite.qmap")).unwrap();
            let next:Value=serde_json::from_slice(&fs::read(fixture.base.join("next.json")).unwrap()).unwrap();store.save(patch(&next,1)).unwrap();
        }
        fixture.terminate("export",point);
        let mut archive=zip::ZipArchive::new(fs::File::open(fixture.base.join("overwrite.qmap")).unwrap()).unwrap();
        let mut doc_bytes=Vec::new();archive.by_name("document.json").unwrap().read_to_end(&mut doc_bytes).unwrap();
        let doc:Value=serde_json::from_slice(&doc_bytes).unwrap();crate::store::validate(&doc).unwrap();
        let expected=if point=="file_before_replace"{"旧版本"}else{"新版本"};assert_eq!(doc["title"],expected);
        let manifest:Value=serde_json::from_reader(archive.by_name("manifest.json").unwrap()).unwrap();assert_eq!(manifest["documentHash"],hex::encode(Sha256::digest(&doc_bytes)));
        for index in 0..archive.len(){let mut entry=archive.by_index(index).unwrap();std::io::copy(&mut entry,&mut std::io::sink()).unwrap();}
        samples.push(json!({"point":point,"iteration":iteration,"title":expected}));
    }}
    record("project-overwrite",samples);
}

#[test]
fn interrupted_migration_preserves_usable_library_and_source(){
    let mut samples=Vec::new();
    for point in ["migration_after_backup","migration_after_assets","migration_after_publish","migration_after_settings"]{for iteration in 1..=10{
        let fixture=Fixture::new();fixture.terminate("migration",point);let recovered=fixture.open();fixture.check_integrity(&recovered);
        assert_eq!(recovered.load("fault-doc").unwrap(),fixture.original);
        let target=if point=="migration_after_settings"{"迁移目标"}else{"library"};assert_eq!(recovered.root().unwrap(),fixture.base.join(target).canonicalize().unwrap());
        let source=crate::store::open_db(&fixture.base.join("library")).unwrap();let integrity:String=source.query_row("PRAGMA integrity_check",[],|r|r.get(0)).unwrap();assert_eq!(integrity,"ok");
        samples.push(json!({"point":point,"iteration":iteration,"connectedLibrary":target,"originalRetained":true}));
    }}
    record("migration-interruption",samples);
}
