use crate::{assets::hash_file,store::{atomic_write,err,open_db,Result,Settings,Store}};
use serde_json::Value;
use std::{fs,path::Path};

impl Store {
    pub fn migrate(&mut self,destination:&Path)->Result<()> {
        if !destination.is_absolute() { return Err("请选择绝对目录".into()); }
        fs::create_dir_all(destination).map_err(err)?;
        let destination=destination.canonicalize().map_err(err)?;
        let old=self.root()?.canonicalize().map_err(err)?;
        if destination==old { return Ok(()); }
        if destination.starts_with(&old) || old.starts_with(&destination) { return Err("新旧存储目录不能互相包含".into()); }
        if fs::read_dir(&destination).map_err(err)?.next().is_some() { return Err("迁移目标需要是空目录，避免覆盖已有文件".into()); }
        let stage=destination.join(format!(".qingtu-migration-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&stage).map_err(err)?;
        let result=(||->Result<()> {
            self.db()?.backup(rusqlite::MAIN_DB,stage.join("library.sqlite3"),None).map_err(err)?;
            crate::store::checkpoint("migration_after_backup");
            for dir in ["assets","thumbs"] {
                fs::create_dir_all(stage.join(dir)).map_err(err)?;
                for entry in fs::read_dir(old.join(dir)).map_err(err)? {
                    let entry=entry.map_err(err)?;
                    if !entry.file_type().map_err(err)?.is_file() { continue; }
                    let target=stage.join(dir).join(entry.file_name());
                    fs::copy(entry.path(),&target).map_err(err)?;
                    if hash_file(&entry.path())?!=hash_file(&target)? { return Err("素材迁移哈希校验失败，原目录已保留".into()); }
                }
            }
            crate::store::checkpoint("migration_after_assets");
            let check=open_db(&stage)?;
            let integrity:String=check.query_row("PRAGMA integrity_check",[],|r|r.get(0)).map_err(err)?;
            if integrity!="ok" { return Err("新资料库校验失败".into()); }
            check.close().map_err(|(_,e)|err(e))?;
            for entry in fs::read_dir(&stage).map_err(err)? {
                let entry=entry.map_err(err)?;
                fs::rename(entry.path(),destination.join(entry.file_name())).map_err(err)?;
            }
            crate::store::checkpoint("migration_after_publish");
            let new_db=open_db(&destination)?;
            let next=Settings { storage_path:destination.clone(),recent_id:self.settings.as_ref().and_then(|s|s.recent_id.clone()),default_node_kind:self.settings.as_ref().and_then(|s|s.default_node_kind.clone()) };
            atomic_write(&self.config_path,&serde_json::to_vec_pretty(&next).map_err(err)?)?;
            crate::store::checkpoint("migration_after_settings");
            self.connection=Some(new_db); self.settings=Some(next);
            Ok(())
        })();
        // Only remove the UUID staging directory created by this operation, never user files.
        if stage.parent()==Some(destination.as_path()) && stage.file_name().unwrap_or_default().to_string_lossy().starts_with(".qingtu-migration-") {
            let _=fs::remove_dir_all(&stage);
        }
        result
    }
    pub fn asset_path(&self,id:&str,thumbnail:bool)->Result<std::path::PathBuf> {
        let data:String=self.db()?.query_row("SELECT data FROM assets WHERE id=?1",[id],|r|r.get(0)).map_err(err)?;
        let asset:Value=serde_json::from_str(&data).map_err(err)?;
        let relative=if thumbnail {asset["thumbnailPath"].as_str().or(asset["relativePath"].as_str())} else {asset["relativePath"].as_str()}.ok_or("素材路径无效")?;
        let root=self.root()?.canonicalize().map_err(err)?;
        let target=root.join(relative).canonicalize().map_err(err)?;
        if !target.starts_with(root.join("assets")) && !target.starts_with(root.join("thumbs")) { return Err("素材访问越界".into()); }
        if thumbnail&&target.starts_with(root.join("thumbs"))&&fs::metadata(&target).map_err(err)?.len()>200*1024 {
            let (w,h)=image::ImageReader::open(&target).map_err(err)?.into_dimensions().map_err(err)?;
            if w==0||h==0||w>512||h>512{return Err("缩略图尺寸无效，请重新导入素材".into());}
            let normalized=crate::assets::thumbnail_bytes(&image::open(&target).map_err(err)?)?;
            atomic_write(&target,&normalized)?;
        }
        Ok(target)
    }
}
