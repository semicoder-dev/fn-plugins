import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "@semicoder/fn-sdk/runtime";

export const entrySchema = z.strictObject({
  id: z.string().regex(/^cordis-(translate|quick-notes|web-search)$/),
  packageName: z.string().regex(/^@semicoder\/fn-cordis-[a-z-]+$/),
  name: z.string().min(1).max(100), description: z.string().max(1000),
  icon: z.string().min(1).max(4), iconSvg: z.string().max(8192),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), core: z.record(z.string(), z.string()),
});
export const indexSchema = z.strictObject({ schemaVersion: z.literal(2), name: z.string(), applications: z.array(entrySchema) })
  .refine(index => new Set(index.applications.map(app => app.id)).size === index.applications.length, "Duplicate application ID");
export const root = import.meta.dir;
export const indexPath = join(root, "../../marketplace-cordis.json");
export function releaseURL(id: string, version: string) {
  return `https://github.com/semicoder-dev/fn-plugins/releases/download/${id}-v${version}/${id}-${version}.tgz`;
}
export async function verifyPublic(entry: z.infer<typeof entrySchema>) {
  if (entry.url !== releaseURL(entry.id, entry.version)) throw new Error("Expected immutable official release URL");
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Archive unavailable: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 50 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Archive hash/size mismatch");
}
export function promote(index: z.infer<typeof indexSchema>, entry: z.infer<typeof entrySchema>) {
  entrySchema.parse(entry);
  const previous = index.applications.find(app => app.id === entry.id);
  if (previous) {
    const a=entry.version.split(".").map(Number),b=previous.version.split(".").map(Number);
    const delta=a.map((value,i)=>value-b[i]!).find(value=>value!==0)??0;
    if(previous.packageName!==entry.packageName||delta<0||(delta===0&&JSON.stringify(previous)!==JSON.stringify(entry))) throw new Error("Cannot change identity, downgrade or replace an immutable version");
  }
  return indexSchema.parse({ ...index, applications: [...index.applications.filter(app=>app.id!==entry.id),entry].sort((a,b)=>a.id.localeCompare(b.id)) });
}
if(import.meta.main){
  const action=process.argv[2];
  let index=indexSchema.parse(await Bun.file(indexPath).json());
  if(action==="candidate"){
    for(const name of ["translate","quick-notes","web-search"]){
      const pkg=await Bun.file(join(root,"apps",name,"package.json")).json();
      const filename=`${pkg.fn.id}-${pkg.version}.tgz`;
      const bytes=await Bun.file(join(root,"artifacts",`${name}.tgz`)).arrayBuffer();
      const entry=entrySchema.parse({id:pkg.fn.id,packageName:pkg.name,name:pkg.fn.name,description:pkg.fn.description,icon:pkg.fn.icon,iconSvg:await Bun.file(join(root,"apps",name,pkg.fn.iconSvg)).text(),version:pkg.version,url:releaseURL(pkg.fn.id,pkg.version),sha256:createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),core:pkg.peerDependencies});
      await Bun.write(join(root,"artifacts",filename),bytes);
      await Bun.write(join(root,"artifacts",filename+".sha256"),`${entry.sha256}  ${filename}\n`);
      await Bun.write(join(root,"artifacts",`${pkg.fn.id}.json`),JSON.stringify(entry,null,2)+"\n");
    }
  }else if(action==="promote"){
    for(const path of process.argv.slice(3)){ const entry=entrySchema.parse(await Bun.file(path).json());await verifyPublic(entry);index=promote(index,entry); }
    await Bun.write(indexPath,JSON.stringify(index,null,2)+"\n");
  }else if(action!=="check")throw new Error("catalog.ts candidate|check|promote [entries...]");
  console.log(`Verified ${index.applications.length} Cordis market entries`);
}
