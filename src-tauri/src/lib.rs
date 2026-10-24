mod store;
mod documents;
mod assets;
mod migration;
mod projects;
mod png;
#[cfg(test)]
mod tests;
#[cfg(all(test,windows))]
mod fault_tests;

use std::{path::PathBuf,sync::Mutex};
use serde_json::{json,Value};
use store::{err,Result,Store};
use tauri::{Emitter,Manager};

pub struct AppState(pub Mutex<Store>,pub Mutex<Option<String>>);
async fn task<T:Send+'static>(app:tauri::AppHandle,work:impl FnOnce(&mut Store)->Result<T>+Send+'static)->Result<T> {
    tauri::async_runtime::spawn_blocking(move|| {
        let state=app.state::<AppState>();
        let mut store=state.0.lock().map_err(|_|"存储任务异常，请重新打开软件")?;
        work(&mut store)
    }).await.map_err(err)?
}
fn permit_assets(app:&tauri::AppHandle)->Result<()> {
    let state=app.state::<AppState>();let store=state.0.lock().map_err(err)?;
    if let Ok(root)=store.root() {
        app.asset_protocol_scope().allow_directory(root.join("assets"),true).map_err(err)?;
        app.asset_protocol_scope().allow_directory(root.join("thumbs"),true).map_err(err)?;
    } Ok(())
}
#[tauri::command]
async fn bootstrap(app:tauri::AppHandle)->Result<Value> {
    task(app,|s|s.info()).await
}
#[tauri::command]
async fn set_library_workspace(app:tauri::AppHandle,workspace:Value)->Result<()> {task(app,move|s|s.set_workspace(workspace)).await}
#[tauri::command]
async fn set_default_node_kind(app:tauri::AppHandle,kind:Option<String>)->Result<Value> {task(app,move|s|s.set_default_node_kind(kind)).await}
#[tauri::command]
fn storage_exists(directory:String)->bool {PathBuf::from(directory).join("library.sqlite3").is_file()}
#[tauri::command]
async fn initialize_storage(app:tauri::AppHandle,directory:String)->Result<Value> {
    let result=task(app.clone(),move|s|{s.initialize(&PathBuf::from(directory))?;s.info()}).await?;
    permit_assets(&app)?;Ok(result)
}
#[tauri::command]
async fn migrate_storage(app:tauri::AppHandle,directory:String)->Result<Value> {
    let result=task(app.clone(),move|s|{s.migrate(&PathBuf::from(directory))?;s.info()}).await?;
    permit_assets(&app)?;Ok(result)
}
#[tauri::command]
async fn load_document(app:tauri::AppHandle,id:String)->Result<Value> {task(app,move|s|{
    let doc=s.load(&id)?;
    if s.settings.as_ref().and_then(|settings|settings.recent_id.as_deref())!=Some(id.as_str()){
        if let Some(settings)=&mut s.settings{settings.recent_id=Some(id);}
        s.write_settings()?;
    }
    Ok(doc)
}).await}
#[tauri::command]
async fn save_document(app:tauri::AppHandle,patch:Value)->Result<Value> {task(app,move|s|s.save(patch)).await}
#[tauri::command]
async fn delete_document(app:tauri::AppHandle,id:String)->Result<()> {task(app,move|s|s.delete_document(&id)).await}
#[tauri::command]
async fn import_asset(app:tauri::AppHandle,path:String)->Result<Value> {task(app,move|s|s.import_asset(&PathBuf::from(path))).await}
#[tauri::command]
async fn import_clipboard_image(app:tauri::AppHandle,request:tauri::ipc::Request<'_>)->Result<Value> {
    let tauri::ipc::InvokeBody::Raw(bytes)=request.body() else {return Err("图片必须使用二进制数据传输".into());};
    if bytes.is_empty()||bytes.len()>10*1024*1024{return Err("图片为空或超过 10 MiB".into());}
    let encoded=request.headers().get("x-qingtu-image-name").and_then(|value|value.to_str().ok()).unwrap_or("");
    if encoded.len()>4096{return Err("图片名称过长".into());}
    let name=String::from_utf8(hex::decode(encoded).map_err(err)?).map_err(err)?;
    let bytes=bytes.clone();task(app,move|s|s.import_image_bytes(&bytes,&name)).await
}
#[tauri::command]
async fn import_clipboard_video(app:tauri::AppHandle,request:tauri::ipc::Request<'_>)->Result<Value> {
    let tauri::ipc::InvokeBody::Raw(bytes)=request.body() else{return Err("视频必须使用二进制数据传输".into());};
    if bytes.is_empty()||bytes.len()>100*1024*1024{return Err("视频为空或超过 100 MiB".into());}
    let encoded=request.headers().get("x-qingtu-video-name").and_then(|value|value.to_str().ok()).unwrap_or("");
    if encoded.len()>4096{return Err("视频名称过长".into());}
    let name=String::from_utf8(hex::decode(encoded).map_err(err)?).map_err(err)?;let bytes=bytes.clone();
    task(app,move|s|s.import_video_bytes(&bytes,&name)).await
}
#[tauri::command]
async fn set_asset_metadata(app:tauri::AppHandle,id:String,metadata:Value)->Result<Value> {task(app,move|s|s.set_asset_metadata(&id,metadata)).await}
#[tauri::command]
async fn seed_assets(app:tauri::AppHandle)->Result<Value> {
    task(app,move|s|{
        let mut result=serde_json::Map::new();
        for (name,extension,bytes) in [("triangle","png",include_bytes!("../../public/demo/triangle.png").as_slice()),("geometry","png",include_bytes!("../../public/demo/geometry.png").as_slice()),("lesson","mp4",include_bytes!("../../public/demo/lesson.mp4").as_slice())] {
            let file=s.root()?.join("assets").join(format!(".seed-{name}.{extension}"));
            std::fs::write(&file,bytes).map_err(err)?;
            let asset=s.import_asset(&file)?;
            let _=std::fs::remove_file(&file);
            result.insert(name.into(),asset);
        }
        Ok(Value::Object(result))
    }).await
}
#[tauri::command]
async fn export_project(app:tauri::AppHandle,id:String,path:String)->Result<()> {task(app,move|s|s.export_project(&id,&PathBuf::from(path))).await}
#[tauri::command]
async fn export_snapshot(app:tauri::AppHandle,document:Value,path:String)->Result<()> {task(app,move|s|s.export_snapshot(&document,&PathBuf::from(path))).await}
#[tauri::command]
async fn import_project(app:tauri::AppHandle,path:String)->Result<Value> {task(app,move|s|s.import_project(&PathBuf::from(path))).await}
#[tauri::command]
async fn get_asset_path(app:tauri::AppHandle,id:String,thumbnail:bool)->Result<String> {
    task(app,move|s|Ok(s.asset_path(&id,thumbnail)?.to_string_lossy().into_owned())).await
}
#[tauri::command]
async fn save_png(request:tauri::ipc::Request<'_>)->Result<()> {
    let tauri::ipc::InvokeBody::Raw(bytes)=request.body() else {return Err("PNG 必须使用二进制数据传输".into());};
    png::validate(bytes)?;
    let encoded=request.headers().get("x-qingtu-path").and_then(|value|value.to_str().ok()).ok_or("缺少 PNG 保存路径")?;
    let path=png::destination(encoded)?;
    let bytes=bytes.clone();
    tauri::async_runtime::spawn_blocking(move||store::atomic_write(&path,&bytes)).await.map_err(err)?
}
#[tauri::command]
fn pending_project(app:tauri::AppHandle)->Result<Option<String>> {
    Ok(app.state::<AppState>().1.lock().map_err(err)?.take())
}
#[tauri::command]
fn ready(app:tauri::AppHandle)->Result<Value> {
    let millis=std::env::var("QINGTU_START_TOKEN").unwrap_or_default();
    if let Ok(path)=std::env::var("QINGTU_READY_FILE") {
        store::atomic_write(&PathBuf::from(path),&serde_json::to_vec(&json!({"token":millis,"readyAt":store::now()})).map_err(err)?)?;
    }
    app.emit("qingtu-ready",()).map_err(err)?;
    Ok(json!({"ok":true}))
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,args,_| {
            if let Some(window)=app.get_webview_window("main") {let _=window.unminimize();let _=window.set_focus();}
            if let Some(path)=args.into_iter().skip(1).find(|x|x.to_lowercase().ends_with(".qmap")) {let _=app.emit("open-project",path);}
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let config_dir=std::env::var_os("QINGTU_CONFIG_DIR").map(PathBuf::from).unwrap_or(app.path().app_config_dir()?);
            let config_path=config_dir.join("settings.json");
            let store=Store::new(config_path.clone()).unwrap_or_else(|error|Store {config_path,settings:None,connection:None,startup_error:Some(error)});
            let pending=std::env::args().skip(1).find(|x|x.to_lowercase().ends_with(".qmap"));
            app.manage(AppState(Mutex::new(store),Mutex::new(pending)));
            permit_assets(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![bootstrap,set_library_workspace,set_default_node_kind,storage_exists,initialize_storage,migrate_storage,load_document,save_document,delete_document,import_asset,import_clipboard_image,import_clipboard_video,set_asset_metadata,seed_assets,export_project,export_snapshot,import_project,get_asset_path,save_png,pending_project,ready])
        .run(tauri::generate_context!())
        .expect("无法启动轻图");
}
