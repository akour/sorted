export type SubmittedListing={language:string;title:string;shortDescription:string;fullDescription:string};
export type PublicListingCheck={locale:string;status:"match"|"different"|"unavailable";checkedAt:string;url:string;detail:string};
export type ListingReceipt={id:number;packageName:string;phase:"submitting"|"submitted"|"failed"|"unknown";attemptedAt:string;submittedAt?:string;editId?:string;error?:string;listings:SubmittedListing[];checks:PublicListingCheck[]};
export function comparePublicListing(expected:SubmittedListing,actual:{title?:string;shortDescription?:string;longDescription?:string}|undefined):PublicListingCheck["status"] {
  if(!actual?.title?.trim()||!actual.shortDescription?.trim()||!actual.longDescription?.trim())return "unavailable";
  const normalize=(v:string)=>v.normalize("NFKC").replace(/\s+/g," ").trim();
  return normalize(expected.title)===normalize(actual.title)&&normalize(expected.shortDescription)===normalize(actual.shortDescription)&&normalize(expected.fullDescription)===normalize(actual.longDescription)?"match":"different";
}
