export type OutcomeScope={locale:string;country:string;trafficSource:string};
export type OutcomeWindow={start:string;end:string};
export type OutcomeRow={date:string;locale:string;country:string;trafficSource:string;searchTerm:string;installClicks:number|null;openClicks:number|null;preRegistrationClicks:number|null;sourceRow:number};
export type OutcomeMetric="unique-install-clicks"|"unique-open-clicks"|"unique-pre-registration-clicks";
export type ListingOutcome={experimentId:string;recordedAt:string;decision:"keep"|"revisit"|"inconclusive";notes:string;scope:OutcomeScope;metric:OutcomeMetric;baseline:{importId:number;fileName:string;window:OutcomeWindow;mean:number;days:number;sourceRows:number[]};comparison:{importId:number;fileName:string;window:OutcomeWindow;mean:number;days:number;sourceRows:number[]};relativeChange:number|null};
function day(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Choose valid ISO dates for both periods.");const n=Date.parse(`${value}T00:00:00Z`);if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw new Error("Choose valid dates.");return n;}
export function compareListingPeriods(a:OutcomeRow[],b:OutcomeRow[],scope:OutcomeScope,metric:OutcomeMetric,baseline:OutcomeWindow,comparison:OutcomeWindow){
 if(!scope.locale.trim()||!scope.country.trim()||!scope.trafficSource.trim())throw new Error("Specify the same locale, country and traffic source for both periods.");
 const startA=day(baseline.start),endA=day(baseline.end),startB=day(comparison.start),endB=day(comparison.end);
 if(endA<startA||endB<startB||endA>=startB)throw new Error("Use a baseline followed by a separate, non-overlapping comparison period.");
 const daysA=(endA-startA)/86400000+1,daysB=(endB-startB)/86400000+1;
 if(daysA!==daysB||daysA>90)throw new Error("Use equal-length periods of at most 90 days.");
 const key=({"unique-install-clicks":"installClicks","unique-open-clicks":"openClicks","unique-pre-registration-clicks":"preRegistrationClicks"} as const)[metric];
 if(!key)throw new Error("Choose an observed listing-click metric.");
 function summarize(rows:OutcomeRow[],window:OutcomeWindow,days:number){const filtered=rows.filter(r=>r.locale===scope.locale&&r.country===scope.country&&r.trafficSource===scope.trafficSource&&!r.searchTerm.trim()&&r.date>=window.start&&r.date<=window.end);const seen=new Set<string>();let total=0;
  for(const r of filtered){day(r.date);if(seen.has(r.date))throw new Error("More than one matching row exists for a day. Use an aggregate daily report without overlapping segments.");seen.add(r.date);const v=r[key];if(typeof v!=="number"||!Number.isFinite(v)||v<0||!Number.isInteger(v))throw new Error("A daily click value is missing or invalid. Missing is not zero.");total+=v;}
  if(seen.size!==days)throw new Error("Not measured: this scope does not have one observed row for every day in both periods. Search-term rows are excluded; use daily aggregate rows.");
  return {mean:total/days,days,sourceRows:filtered.map(r=>r.sourceRow)};
 }
 const first=summarize(a,baseline,daysA),second=summarize(b,comparison,daysB);
 return {baseline:first,comparison:second,relativeChange:first.mean===0?null:(second.mean-first.mean)/first.mean*100};
}
