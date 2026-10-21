import { expect, test } from "bun:test";
import { indexSchema, promote, releaseURL } from "../catalog";
const entry={id:"cordis-translate",packageName:"@semicoder/fn-cordis-translate",name:"译文",description:"",icon:"文",iconSvg:"<svg/>",version:"0.1.0",url:releaseURL("cordis-translate","0.1.0"),sha256:"a".repeat(64),core:{"@semicoder/fn-sdk":"0.4.0"}};
test("market rejects identity changes, version replacement, downgrade and duplicate ids",()=>{
 const index=promote({schemaVersion:2,name:"fn",applications:[]},entry);
 expect(promote(index,entry)).toEqual(index);
 expect(()=>promote(index,{...entry,sha256:"b".repeat(64)})).toThrow();
 expect(()=>promote(index,{...entry,version:"0.0.9"})).toThrow();
 expect(()=>promote(index,{...entry,packageName:"@semicoder/fn-cordis-other"})).toThrow();
 expect(()=>indexSchema.parse({...index,applications:[entry,entry]})).toThrow();
});
