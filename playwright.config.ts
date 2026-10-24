import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/ui',fullyParallel:false,workers:1,timeout:30000,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:1420',channel:'msedge',headless:true,viewport:{width:1440,height:920},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:true,timeout:30000},
});
