import {and,desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {products,optimizationPlans,productConnections,productOauthConnections,listingSubmissionReceipts,listingChangeOutcomes,googlePlayPerformanceImports,websiteSeoAudits,aeoVisibilityObservations} from "@/db/schema";
import {getOwnerId,ownerAuthenticationRequired} from "@/lib/owner";
import {productWorkspaceKind} from "@/lib/product-workspace";
import {productNextAction,type NextActionFacts} from "@/lib/product-next-action";
import {parseOptimizationStorage} from "@/lib/aso-experiments";
import {parseGooglePlayCurrentListing,resolveGooglePlayListingSource,validateGooglePlayListingText} from "@/lib/google-play-localizations";
import {normalizeAeoObservation,isDiscoveryObservation} from "@/lib/aeo-monitor";
import type {ListingReceipt} from "@/lib/listing-receipts";
function json<T>(value:string|undefined,fallback:T):T{try{return value?JSON.parse(value) as T:fallback;}catch{return fallback;}}
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{
 const ownerId=await getOwnerId();if(!ownerId)return ownerAuthenticationRequired();const id=Number((await context.params).id);if(!Number.isSafeInteger(id)||id<1)return Response.json({error:"Product not found."},{status:404});const db=getDb();const [product]=await db.select().from(products).where(and(eq(products.id,id),eq(products.ownerId,ownerId))).limit(1);if(!product)return Response.json({error:"Product not found."},{status:404});
 const [plans,service,oauth,receipts,outcomes,reports,seo,observations]=await Promise.all([
 db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId,id),eq(optimizationPlans.ownerId,ownerId))).limit(1),
 db.select({status:productConnections.status}).from(productConnections).where(and(eq(productConnections.productId,id),eq(productConnections.ownerId,ownerId),eq(productConnections.provider,"google-play"))).limit(1),
 db.select({status:productOauthConnections.status}).from(productOauthConnections).where(and(eq(productOauthConnections.productId,id),eq(productOauthConnections.ownerId,ownerId),eq(productOauthConnections.provider,"google-play"))).limit(1),
 db.select().from(listingSubmissionReceipts).where(and(eq(listingSubmissionReceipts.productId,id),eq(listingSubmissionReceipts.ownerId,ownerId))).orderBy(desc(listingSubmissionReceipts.id)).limit(1),
 db.select({experimentId:listingChangeOutcomes.experimentId}).from(listingChangeOutcomes).where(and(eq(listingChangeOutcomes.productId,id),eq(listingChangeOutcomes.ownerId,ownerId))),
 db.select({id:googlePlayPerformanceImports.id}).from(googlePlayPerformanceImports).where(and(eq(googlePlayPerformanceImports.productId,id),eq(googlePlayPerformanceImports.ownerId,ownerId),eq(googlePlayPerformanceImports.reportType,"click-intent"))),
 db.select().from(websiteSeoAudits).where(and(eq(websiteSeoAudits.productId,id),eq(websiteSeoAudits.ownerId,ownerId))).limit(1),
 db.select({observation:aeoVisibilityObservations.observation}).from(aeoVisibilityObservations).where(and(eq(aeoVisibilityObservations.productId,id),eq(aeoVisibilityObservations.ownerId,ownerId))).limit(200),
 ]);
 const plan=plans[0],baseline=parseGooglePlayCurrentListing(plan?.currentListing),source=resolveGooglePlayListingSource({title:plan?.storeTitle||"",shortDescription:plan?.storeShortDescription||"",fullDescription:plan?.storeLongDescription||""},baseline).listing;
 const norm=(v:string|undefined)=>(v||"").replace(/\s+/g," ").trim();const draftChanged=norm(source.title)!==norm(baseline.title)||norm(source.shortDescription)!==norm(baseline.shortDescription)||norm(source.fullDescription)!==norm(baseline.longDescription);
 const changes=parseOptimizationStorage(plan?.opportunities).experiments.filter(e=>e.listingChange),measured=new Set(outcomes.map(o=>o.experimentId));const receipt=json<Omit<ListingReceipt,"id">|null>(receipts[0]?.receipt,null);const audit=json<{checkedAt?:string;checks?:Array<{passed:boolean}>}>(seo[0]?.audit,{});
 const snapshot=json<{fetchedAt?:unknown}>(plan?.currentListing,{});const baselineAt=typeof snapshot.fetchedAt==="string"&&Number.isFinite(Date.parse(snapshot.fetchedAt))?snapshot.fetchedAt:"";
 const f:NextActionFacts={kind:productWorkspaceKind(product),connected:service[0]?.status==="connected"||oauth[0]?.status==="connected",baselineAt,draftChanged,draftValid:validateGooglePlayListingText(source).length===0,changes:changes.length,unmeasured:changes.filter(c=>!measured.has(c.id)).length,reports:reports.length,receiptPhase:receipt?.phase||"",uncheckedSubmission:Boolean(receipt?.phase==="submitted"&&receipt.listings.some(l=>!receipt.checks.some(c=>c.locale===l.language&&c.status==="match"))),seoCheckedAt:audit.checkedAt||"",seoIssues:(audit.checks||[]).filter(c=>!c.passed).length,pageReviewed:false,discovery:observations.filter(o=>{const row=normalizeAeoObservation(json(o.observation,null));return row&&isDiscoveryObservation(row);}).length};
 const evidence=f.kind==="google-play"?[`Google Play connection: ${f.connected?"saved as connected":"no active connection saved"}`,`Listing baseline: ${f.baselineAt||"not fetched"}`,`Saved draft: ${f.draftChanged?"differs from baseline":"no detected copy difference"}`,`${f.changes} saved listing changes · ${f.unmeasured} without a recorded comparison`,`${f.reports} compatible listing-click reports`,receipt?`Latest submission: ${receipt.phase} · ${receipt.attemptedAt}`:"No submission receipt recorded"]:f.kind==="website"?[`Website inspection: ${f.seoCheckedAt||"not recorded"}`,`${f.seoIssues} findings in the saved inspection`,`${f.discovery} confirmed search-enabled captures in up to 200 observations. Model-memory checks are excluded.`]:[f.kind==="app-store"?"Apple direct publishing and performance are not connected.":"No supported store destination is selected."];
 return Response.json({action:productNextAction(f),evidence,checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return Response.json({error:"Could not check this product’s saved evidence. Your tools and drafts are unchanged."},{status:500});}}
