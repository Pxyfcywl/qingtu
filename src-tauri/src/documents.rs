use crate::store::{err, now, validate, Result, Store};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::collections::HashSet;

pub fn asset_ids(value: &Value, output: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(id)=map.get("assetId").and_then(|v|v.as_str()) { if !id.is_empty() { output.insert(id.into()); } }
            for v in map.values() { asset_ids(v,output); }
        },
        Value::Array(values) => for v in values { asset_ids(v,output); },
        _=>{}
    }
}
impl Store {
    pub fn save(&mut self, patch: Value) -> Result<Value> {
        let id=patch["document"]["id"].as_str().ok_or("缺少文档 ID")?.to_string();
        let command=patch["commandId"].as_str().ok_or("缺少命令 ID")?;
        if let Some(revision)=self.db()?.query_row("SELECT revision FROM commands WHERE id=?1 AND doc_id=?2",params![command,id],|r|r.get::<_,i64>(0)).optional().map_err(err)? {
            return Ok(json!({"revision":revision}));
        }
        let existing=self.db()?.query_row("SELECT data FROM documents WHERE id=?1",[&id],|r|r.get::<_,String>(0)).optional().map_err(err)?;
        let revision=existing.as_ref().map(|s|serde_json::from_str::<Value>(s).map(|v|v["revision"].as_i64().unwrap_or(0))).transpose().map_err(err)?.unwrap_or(0);
        if patch["baseRevision"].as_i64()!=Some(revision) { return Err("文档版本已变化，请重新打开以避免覆盖".into()); }
        let mut complete=if existing.is_some() { self.load(&id)? } else { json!({"nodes":{}}) };
        let mut metadata=patch["document"].clone();
        metadata.as_object_mut().ok_or("文档格式无效")?.remove("nodes");
        let mut nodes=complete["nodes"].take();
        let map=nodes.as_object_mut().ok_or("节点结构无效")?;
        for node in patch["upserts"].as_array().ok_or("缺少节点更新")? {
            let id=node["id"].as_str().ok_or("节点 ID 无效")?;
            map.insert(id.into(),node.clone());
        }
        for id in patch["removedIds"].as_array().ok_or("删除列表无效")? {
            map.remove(id.as_str().ok_or("删除 ID 无效")?);
        }
        metadata["revision"]=json!(revision+1);
        metadata["updatedAt"]=json!(now());
        complete=metadata.clone(); complete["nodes"]=nodes;
        validate(&complete)?;
        let mut assets=HashSet::new(); asset_ids(&complete,&mut assets);
        let mut total=0u64;
        for asset in &assets {
            let data:String=self.db()?.query_row("SELECT data FROM assets WHERE id=?1",[asset],|r|r.get(0)).map_err(|_|format!("素材不存在：{asset}"))?;
            let data:Value=serde_json::from_str(&data).map_err(err)?;
            total+=data["byteSize"].as_u64().unwrap_or(0);
            let relative=data["relativePath"].as_str().ok_or("素材路径缺失")?;
            if !self.root()?.join(relative).is_file() { return Err("素材文件缺失，保存已取消".into()); }
        }
        if total>200*1024*1024 { return Err("当前文档媒体总量不能超过 200 MiB".into()); }
        crate::store::checkpoint("save_before_transaction");
        let db=self.connection.as_mut().ok_or("资料库未打开")?;
        let tx=db.transaction().map_err(err)?;
        tx.execute("INSERT INTO documents VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",params![id,metadata.to_string(),now() as i64]).map_err(err)?;
        crate::store::checkpoint("save_after_metadata");
        for node in patch["upserts"].as_array().unwrap() {
            tx.execute("INSERT INTO nodes VALUES(?1,?2,?3) ON CONFLICT(doc_id,id) DO UPDATE SET data=excluded.data",params![id,node["id"].as_str().unwrap(),node.to_string()]).map_err(err)?;
        }
        for node in patch["removedIds"].as_array().unwrap() {
            tx.execute("DELETE FROM nodes WHERE doc_id=?1 AND id=?2",params![id,node.as_str().unwrap()]).map_err(err)?;
        }
        crate::store::checkpoint("save_after_nodes");
        tx.execute("INSERT INTO revisions VALUES(?1,?2,?3)",params![id,revision+1,complete.to_string()]).map_err(err)?;
        tx.execute("DELETE FROM revisions WHERE doc_id=?1 AND revision<?2",params![id,revision]).map_err(err)?;
        tx.execute("INSERT INTO commands VALUES(?1,?2,?3)",params![command,id,revision+1]).map_err(err)?;
        tx.execute("DELETE FROM commands WHERE rowid NOT IN (SELECT rowid FROM commands ORDER BY rowid DESC LIMIT 1000)",[]).map_err(err)?;
        tx.commit().map_err(err)?;
        crate::store::checkpoint("save_after_commit");
        if let Some(settings)=&mut self.settings { settings.recent_id=Some(id); }
        let warning=self.write_settings().err();
        Ok(json!({"revision":revision+1,"warning":warning}))
    }
    pub fn delete_document(&mut self,id:&str)->Result<()> {
        let mut workspace=self.workspace()?;
        if let Some(tabs)=workspace["openIds"].as_array_mut(){tabs.retain(|tab|tab.as_str()!=Some(id));}
        if let Some(folders)=workspace["documentFolders"].as_object_mut(){folders.remove(id);}
        let tx=self.connection.as_mut().ok_or("资料库未打开")?.transaction().map_err(err)?;
        for table in ["nodes","revisions","commands"] { tx.execute(&format!("DELETE FROM {table} WHERE doc_id=?1"),[id]).map_err(err)?; }
        tx.execute("DELETE FROM documents WHERE id=?1",[id]).map_err(err)?;
        tx.execute("INSERT INTO workspace(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",[workspace.to_string()]).map_err(err)?;
        tx.commit().map_err(err)?;
        if let Some(settings)=&mut self.settings {if settings.recent_id.as_deref()==Some(id){settings.recent_id=None;let _=self.write_settings();}}
        Ok(())
    }
}
