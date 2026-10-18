import {and,desc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {products,listingSubmissionReceipts} from "@/db/schema";
import {getOwnerId,ownerAuthenticationRequired} from "@/lib/owner";
import {comparePublicListing,type ListingReceipt,type PublicListingCheck} from "@/lib/listing-receipts";
import {fetchProductMetadata} from "@/lib/product-icons";

async function access(context:{params:Promise<{id:string}>}){
 const ownerId=await getOwnerId();if(!ownerId)return ownerAuthenticationRequired();const productId=Number((await context.params).id);
 if(!Number.isSafeInteger(productId)||productId<1)return Response.json({error:"Product not found."},{status:404});
 const [product]=await getDb().select({id:products.id}).from(products).where(and(eq(products.id,productId),eq(products.ownerId,ownerId))).limit(1);
 return product?{ownerId,productId}:Response.json({error:"Product not found."},{status:404});
}
export async function GET(_r:Request,context:{params:Promise<{id:string}>}){
 try{const auth=await access(context);if(auth instanceof Response)return auth;const rows=await getDb().select().from(listingSubmissionReceipts).where(and(eq(listingSubmissionReceipts.productId,auth.productId),eq(listingSubmissionReceipts.ownerId,auth.ownerId))).orderBy(desc(listingSubmissionReceipts.id)).limit(20);return Response.json({receipts:rows.map(r=>({...JSON.parse(r.receipt),id:r.id}))});}catch{return Response.json({error:"Could not load submission receipts."},{status:500});}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{const auth=await access(context);if(auth instanceof Response)return auth;const body=await request.json() as {receiptId?:number;locale?:string};
 const db=getDb();const [row]=await db.select().from(listingSubmissionReceipts).where(and(eq(listingSubmissionReceipts.id,Number(body.receiptId)),eq(listingSubmissionReceipts.productId,auth.productId),eq(listingSubmissionReceipts.ownerId,auth.ownerId))).limit(1);
 if(!row)return Response.json({error:"Receipt not found."},{status:404});const receipt=JSON.parse(row.receipt) as ListingReceipt;
 if(receipt.phase!=="submitted")return Response.json({error:"This attempt has no confirmed API acceptance. Check Play Console before retrying."},{status:409});
 const expected=receipt.listings.find(l=>l.language===body.locale);if(!expected)return Response.json({error:"Choose a locale from this submission."},{status:400});
 const url=new URL("https://play.google.com/store/apps/details");url.searchParams.set("id",receipt.packageName);url.searchParams.set("hl",expected.language);url.searchParams.set("gl","US");
 let check:PublicListingCheck;
 try{const metadata=await fetchProductMetadata(url.toString());const status=comparePublicListing(expected,metadata?.currentListing);check={locale:expected.language,status,checkedAt:new Date().toISOString(),url:url.toString(),detail:status==="match"?"All three text fields match on the public US page requested in this locale. This is a point-in-time observation, not proof of worldwide rollout or Google's locale selection.":status==="different"?"Public text differs. This may reflect pending review, rollout, locale fallback, or a later update. It does not establish rejection.":"The public page did not provide all three readable text fields. No live status can be established."};}catch{check={locale:expected.language,status:"unavailable",checkedAt:new Date().toISOString(),url:url.toString(),detail:"The public page could not be read. This does not establish rejection or publication."};}
 const updated={...receipt,id:row.id,checks:[...(receipt.checks||[]).filter(c=>c.locale!==expected.language),check]};await db.update(listingSubmissionReceipts).set({receipt:JSON.stringify(updated)}).where(eq(listingSubmissionReceipts.id,row.id));return Response.json({receipt:updated});
 }catch{return Response.json({error:"Could not save the public-page check."},{status:500});}
}
