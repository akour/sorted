export type NextAction={title:string;reason:string;button:string;view:string};
export type NextActionFacts={kind:"google-play"|"app-store"|"website"|"unselected-store";connected:boolean;baselineAt:string;draftChanged:boolean;draftValid:boolean;changes:number;unmeasured:number;reports:number;receiptPhase:string;uncheckedSubmission:boolean;seoCheckedAt:string;seoIssues:number;pageReviewed:boolean;discovery:number};
export function productNextAction(f:NextActionFacts):NextAction{
 const action=(title:string,reason:string,button:string,view:string)=>({title,reason,button,view});
 if(f.kind==="google-play"){
  if(f.receiptPhase==="unknown"||f.receiptPhase==="submitting")return action("Resolve the last submission first","Sorted has no confirmed acceptance for the last attempt. Check Play Console before retrying; a lost response is not proof that nothing was submitted.","Review submission history","Listing review");
  if(f.uncheckedSubmission)return action("Check the submitted copy publicly","Google accepted the last edit, but one or more submitted locales have no matching public-page observation. A mismatch does not establish rejection.","Check submitted listing","Listing review");
  if(!f.connected)return action("Connect Google Play for this product","No active store connection is saved. Connect the account that can manage this app, then refresh its listing. Existing drafts are preserved.","Open store connection","Connections");
  if(!f.baselineAt)return action("Fetch a dated listing baseline","No dated listing snapshot is saved. Confirm the current copy before comparing or submitting a change.","Refresh store listing","Connections");
  if(f.draftChanged&&!f.draftValid)return action("Finish the listing draft","The proposed listing differs from the saved baseline but does not pass the field checks yet. Review the draft before sending anything.","Review draft fields","Optimize");
  if(f.draftChanged)return action("Review the proposed listing change","The saved draft differs from the last synced listing. Check its copy, change plan and selected locales before deciding whether to submit it.","Review saved draft","Optimize");
  if(f.unmeasured>0)return action("Measure a saved listing change",`${f.unmeasured} saved change record${f.unmeasured===1?" has":"s have"} no recorded comparison. Confirm publication separately, then compare compatible listing reports—or leave the outcome unmeasured.`,"Open change results","Results");
  if(!f.reports)return action("Establish listing-performance evidence","A listing snapshot is saved, but no listing-click report is available. Bring in a baseline report before interpreting copy changes as growth.","Open Results & evidence","Results");
  return action("Choose one message to improve","Your saved evidence is available. Review one listing message and capture a hypothesis rather than regenerating the whole listing.","Review listing copy","Optimize");
 }
 if(f.kind==="website"){
  if(!f.seoCheckedAt)return action("Inspect the public website first","No saved website inspection is available. Check what the page returns before planning SEO or answer-engine changes.","Open website checks","SEO");
  if(f.seoIssues)return action("Review the page findings",`${f.seoIssues} check${f.seoIssues===1?" needs":"s need"} attention in the saved inspection. Review the evidence, fix relevant issues and recheck the page.`,"Review website findings","SEO");
  return action(f.discovery?"Repeat a discovery question":"Capture a search-enabled baseline",f.discovery?"Discovery captures exist. Repeat the same question and context after a public-page change; do not compare model-memory checks as search results.":"The saved page checks do not establish AI visibility. Capture real search-enabled answers with sources before claiming the brand is discoverable.","Open website AEO","Answers");
 }
 if(f.kind==="app-store")return action("Review your Apple listing draft","Apple copy can be prepared here. Direct publishing and performance measurement are not connected; review and publish in App Store Connect.","Open Apple draft","Optimize");
 return action("Choose this product’s destination","Add its Google Play or Apple App Store URL in product settings so the workspace can offer store-specific actions.","Open product settings","Settings");
}
