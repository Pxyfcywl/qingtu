use crate::{assets::{hash_file,validate_asset},documents::asset_ids,store::{err,now,validate,Result,Store}};
use rusqlite::params;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{collections::HashSet, fs,io::{Read,Write},path::{Component,Path}};
use zip::{write::SimpleFileOptions,ZipArchive,ZipWriter};

impl Store {
    pub fn export_project(&self,id:&str,destination:&Path)->Result<()> {
        self.export_snapshot(&self.load(id)?,destination)
    }
    pub fn export_snapshot(&self,doc:&Value,destination:&Path)->Result<()> {
        validate(doc)?;
        let doc_bytes=serde_json::to_vec(doc).map_err(err)?;
        let mut ids=HashSet::new(); asset_ids(doc,&mut ids);
        let mut assets=Vec::<Value>::new();
        for id in ids {
            let data:String=self.db()?.query_row("SELECT data FROM assets WHERE id=?1",[&id],|r|r.get(0)).map_err(err)?;
            let asset:Value=serde_json::from_str(&data).map_err(err)?;validate_asset(&asset)?;
            if hash_file(&self.asset_path(&id,false)?)?!=id{return Err("素材文件损坏，无法导出完整项目".into());}
            assets.push(asset);
        }
        let manifest=json!({"schemaVersion":1,"applicationVersion":env!("CARGO_PKG_VERSION"),"documentHash":hex::encode(Sha256::digest(&doc_bytes)),"assets":assets});
        let parent=destination.parent().ok_or("导出路径无效")?;
        let temporary=parent.join(format!(".qingtu-export-{}.tmp",uuid::Uuid::new_v4()));
        let output=fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(err)?;
        let mut zip=ZipWriter::new(output);
        let options=SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file("manifest.json",options).map_err(err)?;
        zip.write_all(&serde_json::to_vec(&manifest).map_err(err)?).map_err(err)?;
        zip.start_file("document.json",options).map_err(err)?; zip.write_all(&doc_bytes).map_err(err)?;
        let mut written=HashSet::new();
        for asset in &assets {
            for key in ["relativePath","thumbnailPath"] {
                if let Some(relative)=asset[key].as_str() {
                    if !written.insert(relative.to_owned()) {continue;}
                    safe_entry(relative)?;
                    zip.start_file(relative,options).map_err(err)?;
                    let mut f=fs::File::open(self.root()?.join(relative)).map_err(err)?;
                    std::io::copy(&mut f,&mut zip).map_err(err)?;
                }
            }
        }
        let f=zip.finish().map_err(err)?; f.sync_all().map_err(err)?; drop(f);
        // Preserve any existing project until the complete replacement has been checked.
        let verification=ZipArchive::new(fs::File::open(&temporary).map_err(err)?).map_err(err)?;
        if verification.len()<2 {return Err("项目导出校验失败".into());} drop(verification);
        crate::store::publish_file(&temporary,destination)
    }
    pub fn import_project(&mut self,path:&Path)->Result<Value> {
        if fs::metadata(path).map_err(err)?.len()>220*1024*1024 {return Err("项目文件超过 220 MiB".into());}
        let mut zip=ZipArchive::new(fs::File::open(path).map_err(err)?).map_err(err)?;
        if zip.len()>10000 {return Err("项目包含过多文件".into());}
        let root=self.root()?.to_path_buf();
        let stage=root.join(format!(".qingtu-import-{}",uuid::Uuid::new_v4())); fs::create_dir(&stage).map_err(err)?;
        let mut moved_files=Vec::new();
        let result=(||->Result<Value>{
            let mut total=0u64; let mut actual=0u64; let mut names=HashSet::new();
            for index in 0..zip.len() {
                let mut entry=zip.by_index(index).map_err(err)?;
                let name=entry.name().to_owned(); safe_entry(&name)?;
                if !names.insert(name.clone()) {return Err("项目存在重复文件名".into());}
                let limit=if name.ends_with(".json") {10*1024*1024} else {100*1024*1024};
                if entry.size()>limit {return Err("项目单个文件过大".into());}
                total=total.checked_add(entry.size()).ok_or("项目大小无效")?;
                if total>250*1024*1024 {return Err("项目解包超过 250 MiB".into());}
                let target=stage.join(&name);fs::create_dir_all(target.parent().unwrap()).map_err(err)?;
                let mut f=fs::OpenOptions::new().create_new(true).write(true).open(target).map_err(err)?;
                let permitted=limit.min(250*1024*1024-actual);
                let copied=std::io::copy(&mut entry.by_ref().take(permitted+1),&mut f).map_err(err)?;
                if copied>permitted||copied!=entry.size() {return Err("项目解包大小异常".into());}actual+=copied;f.sync_all().map_err(err)?;
            }
            let manifest:Value=serde_json::from_slice(&fs::read(stage.join("manifest.json")).map_err(err)?).map_err(err)?;
            if manifest["schemaVersion"].as_u64()!=Some(1) {return Err("不支持此项目版本".into());}
            let bytes=fs::read(stage.join("document.json")).map_err(err)?;
            if manifest["documentHash"].as_str()!=Some(hex::encode(Sha256::digest(&bytes)).as_str()) {return Err("文档内容哈希不匹配".into());}
            let mut doc:Value=serde_json::from_slice(&bytes).map_err(err)?; validate(&doc)?;
            let assets=manifest["assets"].as_array().ok_or("项目缺少素材清单")?;
            let mut available=HashSet::new(); let mut media_total=0u64;
            for asset in assets {
                validate_asset(asset)?;
                if let Some(relative)=asset["thumbnailPath"].as_str(){
                    let file=stage.join(relative);let reader=image::ImageReader::open(&file).map_err(err)?.with_guessed_format().map_err(err)?;
                    if reader.format()!=Some(image::ImageFormat::Png){return Err("缩略图不是有效 PNG".into());}
                    let (w,h)=reader.into_dimensions().map_err(err)?;
                    if w==0||h==0||w>512||h>512||fs::metadata(&file).map_err(err)?.len()>1024*1024{return Err("缩略图尺寸或大小超限".into());}
                }
                let relative=asset["relativePath"].as_str().ok_or("素材路径无效")?;safe_entry(relative)?;
                let hash=hash_file(&stage.join(relative))?;
                if asset["sha256"].as_str()!=Some(&hash) || asset["id"].as_str()!=Some(&hash) {return Err("素材哈希不匹配".into());}
                let size=fs::metadata(stage.join(relative)).map_err(err)?.len();media_total+=size;
                if asset["byteSize"].as_u64()!=Some(size) {return Err("素材大小不匹配".into());}
                if asset["mime"].as_str().unwrap_or("").starts_with("image/") {
                    let (w,h)=image::ImageReader::open(stage.join(relative)).map_err(err)?.with_guessed_format().map_err(err)?.into_dimensions().map_err(err)?;
                    if u64::from(w)*u64::from(h)>20_000_000||asset["width"].as_u64()!=Some(u64::from(w))||asset["height"].as_u64()!=Some(u64::from(h)){return Err("图片真实尺寸与清单不一致".into());}
                }
                available.insert(hash);
            }
            if media_total>200*1024*1024 {return Err("项目媒体超过 200 MiB".into());}
            let mut required=HashSet::new(); asset_ids(&doc,&mut required);
            if !required.is_subset(&available) {return Err("项目缺少引用素材".into());}
            for asset in assets {
                for key in ["relativePath","thumbnailPath"] {if let Some(relative)=asset[key].as_str() {
                    safe_entry(relative)?;
                    let from=stage.join(relative); if !from.is_file() {return Err("项目素材或封面缺失".into());}
                    let to=root.join(relative); if !to.exists() {fs::rename(&from,&to).map_err(err)?;moved_files.push(to.clone());}
                    else if key=="relativePath"&&hash_file(&to)?!=asset["sha256"].as_str().unwrap_or(""){return Err("本地已有素材损坏，导入已取消".into());}
                }}
            }
            doc["id"]=json!(uuid::Uuid::new_v4().to_string());doc["revision"]=json!(1);doc["updatedAt"]=json!(now());
            let id=doc["id"].as_str().unwrap().to_owned();
            let mut metadata=doc.clone();metadata.as_object_mut().unwrap().remove("nodes");
            let tx=self.connection.as_mut().ok_or("资料库未打开")?.transaction().map_err(err)?;
            for asset in assets {tx.execute("INSERT INTO assets VALUES(?1,?2) ON CONFLICT(id) DO NOTHING",params![asset["id"].as_str().unwrap(),asset.to_string()]).map_err(err)?;}
            tx.execute("INSERT INTO documents VALUES(?1,?2,?3)",params![id,metadata.to_string(),now() as i64]).map_err(err)?;
            for node in doc["nodes"].as_object().unwrap().values(){tx.execute("INSERT INTO nodes VALUES(?1,?2,?3)",params![id,node["id"].as_str().unwrap(),node.to_string()]).map_err(err)?;}
            tx.execute("INSERT INTO revisions VALUES(?1,1,?2)",params![id,doc.to_string()]).map_err(err)?;
            tx.commit().map_err(err)?;
            if let Some(settings)=&mut self.settings{settings.recent_id=Some(id);}
            let _=self.write_settings();
            Ok(doc)
        })();
        if result.is_err(){for file in moved_files{if file.starts_with(root.join("assets"))||file.starts_with(root.join("thumbs")){let _=fs::remove_file(file);}}}
        if stage.parent()==Some(root.as_path()) && stage.file_name().unwrap_or_default().to_string_lossy().starts_with(".qingtu-import-") {let _=fs::remove_dir_all(stage);}
        result
    }
}
fn safe_entry(name:&str)->Result<()> {
    let path=Path::new(name);
    if name.contains('\\') || name.contains(':') || path.is_absolute() || path.components().any(|c|!matches!(c,Component::Normal(_))) {return Err("项目存在非法路径".into());}
    if name!="manifest.json" && name!="document.json" && !name.starts_with("assets/") && !name.starts_with("thumbs/") {return Err("项目包含未知文件".into());}
    Ok(())
}
