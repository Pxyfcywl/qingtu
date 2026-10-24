use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashSet, fs, path::{Path, PathBuf}, time::{Duration, SystemTime, UNIX_EPOCH}};
pub type Result<T> = std::result::Result<T, String>;
pub fn err(e: impl std::fmt::Display) -> String { e.to_string() }
pub fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub storage_path: PathBuf, pub recent_id: Option<String>,
    #[serde(default)]
    pub default_node_kind: Option<String>,
}
pub struct Store {
    pub config_path: PathBuf,
    pub settings: Option<Settings>,
    pub connection: Option<Connection>,
    pub startup_error: Option<String>,
}
#[cfg(windows)]
fn replace_file(source:&Path,destination:&Path)->Result<()> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name="kernel32")]
    extern "system" { fn MoveFileExW(source:*const u16,destination:*const u16,flags:u32)->i32; }
    let from:Vec<u16>=source.as_os_str().encode_wide().chain(Some(0)).collect();
    let to:Vec<u16>=destination.as_os_str().encode_wide().chain(Some(0)).collect();
    // Same-directory replacement: never remove the old destination first.
    let ok=unsafe{MoveFileExW(from.as_ptr(),to.as_ptr(),0x1|0x8)};
    if ok==0 {Err(err(std::io::Error::last_os_error()))}else{Ok(())}
}
#[cfg(not(windows))]
fn replace_file(source:&Path,destination:&Path)->Result<()> {fs::rename(source,destination).map_err(err)}

pub fn publish_file(temporary:&Path,destination:&Path)->Result<()> {
    if temporary.parent()!=destination.parent(){return Err("临时文件与目标必须位于同一目录".into());}
    let backup=destination.parent().ok_or("文件路径无效")?.join(format!(".qingtu-{}.backup",uuid::Uuid::new_v4()));
    let existed=destination.exists();
    if existed {
        let mut source=fs::File::open(destination).map_err(err)?;
        let mut target=fs::OpenOptions::new().create_new(true).write(true).open(&backup).map_err(err)?;
        std::io::copy(&mut source,&mut target).map_err(err)?;target.sync_all().map_err(err)?;drop(target);
        if crate::assets::hash_file(destination)?!=crate::assets::hash_file(&backup)?{return Err("替换前备份校验失败，原文件保留".into());}
    }
    checkpoint("file_before_replace");
    replace_file(temporary,destination)?;
    checkpoint("file_after_replace");
    if existed{let _=fs::remove_file(backup);}Ok(())
}

#[cfg(not(test))]
#[inline(always)]
pub fn checkpoint(_: &str) {}
#[cfg(test)]
pub fn checkpoint(point:&str) {
    if std::env::var("QINGTU_TEST_FAULT").ok().as_deref()!=Some(point){return;}
    eprintln!("Reached forced-termination checkpoint: {point}");
    #[cfg(windows)] unsafe {
        #[link(name="kernel32")]
        extern "system" {fn GetCurrentProcess()->*mut std::ffi::c_void;fn TerminateProcess(process:*mut std::ffi::c_void,code:u32)->i32;}
        TerminateProcess(GetCurrentProcess(),137);
    }
    std::process::abort();
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("文件路径无效")?;
    fs::create_dir_all(parent).map_err(err)?;
    let temp = parent.join(format!(".qingtu-{}.tmp",uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(err)?;
    use std::io::Write;
    file.write_all(bytes).map_err(err)?;
    file.sync_all().map_err(err)?;
    drop(file);
    if fs::read(&temp).map_err(err)? != bytes { return Err("写入校验失败".into()); }
    let result=publish_file(&temp,path);
    if result.is_err(){let _=fs::remove_file(&temp);}
    result
}
pub fn open_db(root: &Path) -> Result<Connection> {
    fs::create_dir_all(root.join("assets")).map_err(err)?;
    fs::create_dir_all(root.join("thumbs")).map_err(err)?;
    let db = Connection::open(root.join("library.sqlite3")).map_err(err)?;
    let version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(err)?;
    if version>1 {return Err("资料库由更新版本创建，请使用对应版本打开".into());}
    db.busy_timeout(Duration::from_secs(3)).map_err(err)?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS nodes(doc_id TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(doc_id,id));
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(doc_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(doc_id,revision));
      CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,doc_id TEXT NOT NULL,revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
      PRAGMA user_version=1;").map_err(err)?;
    Ok(db)
}
impl Store {
    pub fn new(config_path: PathBuf) -> Result<Self> {
        let settings: Option<Settings> = if config_path.exists() {
            Some(serde_json::from_slice(&fs::read(&config_path).map_err(err)?).map_err(|e| format!("设置文件损坏，请保留后恢复：{e}"))?)
        } else { None };
        let connection = settings.as_ref().map(|s| {
            if !s.storage_path.join("library.sqlite3").exists() { return Err("找不到资料库，请重新连接存储目录".into()); }
            open_db(&s.storage_path)
        }).transpose()?;
        Ok(Self { config_path, settings, connection, startup_error: None })
    }
    pub fn root(&self) -> Result<&Path> { self.settings.as_ref().map(|s| s.storage_path.as_path()).ok_or("请先选择存储位置".into()) }
    pub fn db(&self) -> Result<&Connection> { self.connection.as_ref().ok_or("资料库未打开".into()) }
    pub fn write_settings(&self) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(&self.settings).map_err(err)?;
        atomic_write(&self.config_path,&bytes)
    }
    pub fn initialize(&mut self, directory: &Path) -> Result<()> {
        if self.settings.is_some() { return Err("资料库已初始化，请从设置迁移或切换".into()); }
        if !directory.is_absolute() { return Err("请选择绝对目录".into()); }
        fs::create_dir_all(directory).map_err(err)?;
        let root = directory.canonicalize().map_err(err)?;
        let connection = open_db(&root)?;
        self.settings = Some(Settings { storage_path: root, recent_id: None,default_node_kind:None });
        self.startup_error = None;
        self.connection = Some(connection);
        if let Err(e) = self.write_settings() { self.connection = None; self.settings = None; return Err(e); }
        Ok(())
    }
    pub fn info(&self) -> Result<Value> {
        let workspace = self.workspace()?;
        let mut docs = Vec::new();
        let mut assets = Vec::<Value>::new();
        if let Some(db) = &self.connection {
            let mut stmt = db.prepare("SELECT d.id,d.data,d.updated_at,(SELECT COUNT(*) FROM nodes n WHERE n.doc_id=d.id) FROM documents d ORDER BY d.updated_at DESC").map_err(err)?;
            let rows = stmt.query_map([],|r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,i64>(2)?,r.get::<_,i64>(3)?))).map_err(err)?;
            for row in rows { let (id,data,updated,count) = row.map_err(err)?; let v: Value = serde_json::from_str(&data).map_err(err)?;
                docs.push(json!({"id":id,"title":v["title"],"updatedAt":updated,"nodeCount":count})); }
            let mut stmt = db.prepare("SELECT data FROM assets").map_err(err)?;
            for row in stmt.query_map([],|r| r.get::<_,String>(0)).map_err(err)? {
                assets.push(serde_json::from_str(&row.map_err(err)?).map_err(err)?);
            }
        }
        Ok(json!({"initialized":self.connection.is_some(),"startupError":self.startup_error,"storagePath":self.settings.as_ref().map(|x|&x.storage_path),"defaultNodeKind":self.settings.as_ref().and_then(|s|s.default_node_kind.clone()),
            "configPath":self.config_path,"recentId":self.settings.as_ref().and_then(|x|x.recent_id.clone()),"documents":docs,"assets":assets,"workspace":workspace}))
    }
    pub fn workspace(&self)->Result<Value> {
        use rusqlite::OptionalExtension;
        let data = match &self.connection {Some(db)=>db.query_row("SELECT data FROM workspace WHERE id=1",[],|r|r.get::<_,String>(0)).optional().map_err(err)?,None=>None};
        match data {Some(data)=>serde_json::from_str(&data).map_err(err),None=>Ok(json!({"folders":[],"documentFolders":{},"openIds":[]}))}
    }
    pub fn set_workspace(&self,workspace:Value)->Result<()> {
        let folders=workspace["folders"].as_array().ok_or("文件夹列表无效")?;
        let tabs=workspace["openIds"].as_array().ok_or("标签列表无效")?;
        let assignments=workspace["documentFolders"].as_object().ok_or("导图目录无效")?;
        if folders.len()>1000||tabs.len()>5000||assignments.len()>50000{return Err("工作区条目过多".into());}
        let mut ids=HashSet::new();
        for folder in folders {
            let id=folder["id"].as_str().filter(|s|!s.is_empty()&&s.len()<128).ok_or("文件夹 ID 无效")?;
            if !ids.insert(id)||folder["name"].as_str().filter(|s|!s.trim().is_empty()&&s.chars().count()<=100).is_none(){return Err("文件夹名称或 ID 无效".into());}
        }
        if tabs.iter().any(|id|id.as_str().filter(|s|!s.is_empty()&&s.len()<128).is_none())||assignments.values().any(|id|!id.as_str().is_some_and(|id|ids.contains(id))){return Err("工作区引用无效".into());}
        let data=serde_json::to_string(&workspace).map_err(err)?;
        self.db()?.execute("INSERT INTO workspace(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",[data]).map_err(err)?;
        Ok(())
    }
    pub fn set_default_node_kind(&mut self,kind:Option<String>)->Result<Value> {
        if kind.as_deref().is_some_and(|value|!matches!(value,"text"|"card"|"image"|"video")){return Err("默认节点类型无效".into());}
        let mut next=self.settings.clone().ok_or("请先选择资料库存储位置")?;
        next.default_node_kind=kind;
        atomic_write(&self.config_path,&serde_json::to_vec_pretty(&next).map_err(err)?)?;
        self.settings=Some(next);
        Ok(json!({"defaultNodeKind":self.settings.as_ref().and_then(|s|s.default_node_kind.clone())}))
    }
    pub fn load(&self,id: &str) -> Result<Value> {
        let db=self.db()?;
        let data: String=db.query_row("SELECT data FROM documents WHERE id=?1",[id],|r|r.get(0)).map_err(err)?;
        let mut doc: Value=serde_json::from_str(&data).map_err(err)?;
        let mut nodes=serde_json::Map::new();
        let mut stmt=db.prepare("SELECT id,data FROM nodes WHERE doc_id=?1").map_err(err)?;
        for row in stmt.query_map([id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)? {
            let (id,data)=row.map_err(err)?; nodes.insert(id,serde_json::from_str(&data).map_err(err)?);
        }
        doc["nodes"]=Value::Object(nodes);
        validate(&doc)?;
        Ok(doc)
    }
}

pub fn validate(doc: &Value) -> Result<()> {
    if doc["schemaVersion"].as_u64()!=Some(1) { return Err("不支持的项目版本".into()); }
    let nodes=doc["nodes"].as_object().ok_or("节点集合无效")?;
    if doc["id"].as_str().filter(|s|!s.is_empty()&&s.len()<128).is_none() || doc["title"].as_str().filter(|s|s.chars().count()<=500).is_none() {return Err("文档 ID 或标题无效".into());}
    if nodes.is_empty() || nodes.len()>5000 { return Err("节点数量超限".into()); }
    let root=doc["rootId"].as_str().ok_or("缺少根节点")?;
    if !nodes.get(root).map(|n|n["parentId"].is_null()).unwrap_or(false) { return Err("根节点无效".into()); }
    let mut seen=HashSet::new();
    let mut stack=vec![(root.to_owned(),1usize)];
    while let Some((id,depth))=stack.pop() {
        if depth>100 || !seen.insert(id.clone()) { return Err("树深度超限或存在循环".into()); }
        let n=nodes.get(&id).ok_or("节点缺失")?;
        if n["id"].as_str()!=Some(&id) { return Err("节点 ID 不一致".into()); }
        if !matches!(n["kind"].as_str(),Some("text"|"card"|"image"|"video")) { return Err("节点类型无效".into()); }
        if n["title"].as_str().filter(|s|s.chars().count()<=20000).is_none() {return Err("节点标题过长或无效".into());}
        if n["kind"]=="card" {validate_body(&n["body"],0,false,&mut 0,&mut 0)?;}
        for key in ["x","y"] { if !n["position"][key].as_f64().map(|x|x.is_finite()).unwrap_or(false) { return Err("节点位置无效".into()); } }
        for child in n["childIds"].as_array().ok_or("子节点列表无效")? {
            let child=child.as_str().ok_or("子节点 ID 无效")?;
            if nodes.get(child).and_then(|c|c["parentId"].as_str())!=Some(&id) { return Err("父子关系不一致".into()); }
            stack.push((child.to_owned(),depth+1));
        }
    }
    if seen.len()!=nodes.len() { return Err("存在未连接节点".into()); }
    if nodes.values().any(|node|node.get("extraParentIds").is_some()){
        use std::collections::HashMap;
        let mut children:HashMap<String,Vec<String>>=nodes.iter().map(|(id,node)|(id.clone(),node["childIds"].as_array().unwrap().iter().map(|child|child.as_str().unwrap().to_owned()).collect())).collect();
        let mut incoming:HashMap<String,usize>=nodes.iter().map(|(id,node)|(id.clone(),if node["parentId"].is_null(){0}else{1})).collect();
        for (id,node) in nodes {
            if let Some(value)=node.get("extraParentIds"){
                let parents=value.as_array().ok_or("父节点连接列表无效")?;
                if parents.len()>32{return Err("每个节点最多支持 32 个额外父节点".into());}
                let mut unique=HashSet::new();
                for parent in parents {
                    let parent=parent.as_str().ok_or("父节点 ID 无效")?;
                    if id==root||parent==id||node["parentId"].as_str()==Some(parent)||!nodes.contains_key(parent)||!unique.insert(parent){return Err("父节点连接无效或重复".into());}
                    children.get_mut(parent).unwrap().push(id.clone());*incoming.get_mut(id).unwrap()+=1;
                }
            }
        }
        let mut queue=vec![root.to_owned()];let mut depth:HashMap<String,usize>=HashMap::from([(root.to_owned(),1)]);let mut index=0;
        while index<queue.len(){let id=queue[index].clone();index+=1;let level=depth[&id];if level>100{return Err("节点深度超限".into());}
            for child in &children[&id]{let entry=depth.entry(child.clone()).or_insert(0);*entry=(*entry).max(level+1);let degree=incoming.get_mut(child).unwrap();*degree-=1;if *degree==0{queue.push(child.clone());}}
        }
        if queue.len()!=nodes.len(){return Err("父节点连接不能形成循环".into());}
    }
    Ok(())
}
fn validate_body(node:&Value,depth:usize,in_columns:bool,blocks:&mut usize,chars:&mut usize)->Result<()> {
    if depth>24 {return Err("正文层级过深".into());}
    let kind=node["type"].as_str().ok_or("正文块类型缺失")?;
    if !matches!(kind,"doc"|"paragraph"|"text"|"heading"|"bulletList"|"orderedList"|"listItem"|"blockquote"|"codeBlock"|"hardBreak"|"horizontalRule"|"columns"|"column"|"mathBlock"|"mathInline"|"assetImage"|"video"|"table"|"tableRow"|"tableCell"|"tableHeader") {return Err("正文包含未知内容类型".into());}
    if kind!="text" { *blocks+=1; }
    *chars+=node["text"].as_str().map(|s|s.chars().count()).unwrap_or(0);
    *chars+=node["attrs"]["latex"].as_str().map(|s|s.chars().count()).unwrap_or(0);
    if *blocks>200||*chars>20000 {return Err("正文超过 200 个块或 20000 字符，请拆分卡片".into());}
    if kind=="columns" {
        if in_columns {return Err("不支持嵌套双栏".into());}
        let children=node["content"].as_array().ok_or("双栏内容无效")?;
        if children.len()!=2||children.iter().any(|c|c["type"]!="column") {return Err("双栏必须包含两栏".into());}
        if !matches!(node["attrs"]["ratio"].as_str(),Some("1:1"|"3:2")) {return Err("双栏比例无效".into());}
    }
    if matches!(kind,"table"|"tableRow"|"tableCell"|"tableHeader") {
        let content=node["content"].as_array().filter(|items|!items.is_empty()).ok_or("表格内容无效")?;
        if kind=="table"&&content.iter().any(|child|child["type"]!="tableRow"){return Err("表格行结构无效".into());}
        if kind=="tableRow"&&content.iter().any(|child|!matches!(child["type"].as_str(),Some("tableCell"|"tableHeader"))){return Err("表格单元格结构无效".into());}
        if matches!(kind,"tableCell"|"tableHeader") {
            for attr in ["rowspan","colspan"] {if let Some(value)=node["attrs"].get(attr){if !value.as_u64().is_some_and(|n|(1..=100).contains(&n)){return Err("表格合并范围无效".into());}}}
            if content.iter().any(|child|matches!(child["type"].as_str(),Some("text"|"tableRow"|"tableCell"|"tableHeader"))){return Err("表格单元格内容无效".into());}
        }
    }
    if let Some(children)=node["content"].as_array() {
        for child in children {validate_body(child,depth+1,in_columns||kind=="columns",blocks,chars)?;}
    }
    Ok(())
}
