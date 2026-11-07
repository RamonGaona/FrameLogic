import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";
import { createLocalBridge } from "./bridge";
import { connectAutomationBridge } from "../../../packages/bim/core/src/automation/BrowserBridge";
import { createAutomationFixture } from "../../../packages/bim/core/src/automation/fixture";
const origin="http://localhost:5173";
afterEach(()=>vi.unstubAllGlobals());
describe("MCP -> authenticated loopback HTTP -> browser bridge -> real model operations",()=>{
  it("selects, previews, confirms four rotated copies, undo/redo; no unconnected success",async()=>{
    const bridge=createLocalBridge();
    await new Promise<void>(r=>bridge.server.listen(0,"127.0.0.1",r));
    const base=`http://127.0.0.1:${(bridge.server.address() as {port:number}).port}`;
    const server=createMcpServer(bridge.call), client=new Client({name:"test",version:"1"});
    const [a,b]=InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
    const f=createAutomationFixture(); let stop=()=>{};
    try {
      expect((await client.callTool({name:"get_model_info",arguments:{}})).isError).toBe(true);
      expect((await fetch(base+"/poll",{method:"POST",headers:{Origin:"https://evil.example"}})).status).toBe(403);
      expect((await fetch(base+"/poll",{method:"POST",headers:{Origin:origin}})).status).toBe(403);
      const realFetch=globalThis.fetch;
      vi.stubGlobal("fetch",(input: RequestInfo | URL, init?: RequestInit)=>realFetch(input,{...init,headers:{...init?.headers,Origin:origin}}));
      const approve=vi.fn(()=>true);
      stop=connectAutomationBridge(f.operations,bridge.token,approve,base);
      await vi.waitFor(async()=>expect((await bridge.call("get_model_info",{})).ok).toBe(true));
      const call=async(name:string,args:Record<string,unknown>={})=>{
        const r=await client.callTool({name,arguments:args});
        expect(r.isError).not.toBe(true); return r.structuredContent as {ok:boolean;data:Record<string,unknown>};
      };
      await call("select_pieces",{ids:["REC1500-instance"]});
      await call("get_piece_axes",{id:"REC1500-instance"});
      const p=await call("prepare_operation",{request:{operation:"copy_piece_array",id:"REC1500-instance",space:"local",direction:{x:1,y:0,z:0},distance:1500,count:4}});
      expect(f.model.pieceInstances.count).toBe(1);
      await call("confirm_operation",{proposalId:p.data.id});
      expect(f.model.pieceInstances.count).toBe(5);
      expect(f.model.pieceInstances.getAll().slice(1).map(p=>p.transform.position.x)).toEqual([-1400,-2900,-4400,-5900]);
      await call("undo"); expect(f.model.pieceInstances.count).toBe(1);
      await call("redo"); expect(f.model.pieceInstances.count).toBe(5);
      expect(approve).toHaveBeenCalledTimes(4);
      expect((await client.callTool({name:"get_piece",arguments:{id:"missing"}})).isError).toBe(true);
    } finally {stop(); await client.close();await server.close();await bridge.close();}
  },15000);
});
