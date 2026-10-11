import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from 'file:///C:/Users/kirlg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
import { finalizePresentation } from 'file:///C:/Users/kirlg/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations/container_tools/artifact_tool_utils.mjs';

const root='C:/Users/kirlg/PhotoSync/tmp/defense-ppt';
const skill='C:/Users/kirlg/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const p=Presentation.create({slideSize:{width:1280,height:720}});
const C={bg:'#F3EEEE',navy:'#142C4C',text:'#26384B',muted:'#596A7D',blue:'#1D3E69',white:'#FFFFFF',pale:'#B8C9DB'};
function text(s,t,x,y,w,h,size=28,color=C.text,bold=false){
 const sh=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=t;sh.text.style={typeface:'Calibri',fontSize:size,bold,color};return sh;
}
function slide(title,notes='',dark=false){
 const s=p.slides.add();s.background.fill=dark?C.navy:C.bg;
 text(s,title,72,58,1136,100,46,dark?C.white:C.navy,true);
 text(s,String(p.slides.items.length).padStart(2,'0'),1150,663,58,28,16,dark?C.pale:C.muted);
 s.speakerNotes.text=notes;return s;
}
function rows(s,items,start=190,gap=105,dark=false){
 items.forEach(([title,body],i)=>{
 text(s,title,74,start+i*gap,340,65,29,dark?C.white:C.navy,true);
 text(s,body,450,start+i*gap,750,83,27,dark?C.pale:C.text);
 });
}
function cols(s,items){
 const w=(1136-(items.length-1)*46)/items.length;
 items.forEach(([title,body],i)=>{
 const x=72+i*(w+46);text(s,title,x,210,w,80,35,C.navy,true);text(s,body,x,315,w,265,28,C.text);
 });
}
function note(t,sources){return t+'\n\nImplementation sources in C:/Users/kirlg/PhotoSync: '+sources;}
const image=await fs.readFile(root+'/output/PhotoSync_Design.png');
let s=p.slides.add();s.background.fill=C.bg;
s.images.add({blob:image.buffer.slice(image.byteOffset,image.byteOffset+image.byteLength),contentType:'image/png',alt:'Concept illustration of a photography camera and a booking phone in a studio',fit:'cover',position:{left:0,top:0,width:1280,height:720}});
text(s,'PhotoSync',72,205,550,105,82,C.navy,true);
text(s,'Photography Studio\nBooking System',76,326,500,130,39,C.navy);
text(s,'Project Defense\nOctober 10 2026',78,558,470,80,24,C.text);
s.speakerNotes.text=note('Opening: PhotoSync helps clients request photography sessions and photographers manage studio bookings. The cover is an AI generated concept illustration, not an actual screenshot of the application. The image was generated with the built-in image generation tool for this deck.','package.json; app.json; src/app; docs/supabase-setup.md');

s=slide('Project overview',note('Explain the system as a photography booking application. Do not describe it as automatic camera roll backup or completed gallery delivery. The problem statement follows the implemented workflow and is not a claim of measured business impact.','src/app/(client); src/app/photographer; src/services/bookings.ts'));
cols(s,[['Purpose','Organize photography session requests and studio availability in one mobile application.'],['Client','Browse packages, request a schedule and track the studio decision.'],['Photographer','Review requests, manage services and control available times.']]);

s=slide('Booking coordination problem',note('Use these as workflow needs that the system addresses. Avoid claiming survey results, time savings or revenue improvements because the source does not provide those measurements.','src/services/bookings.ts; src/services/calendar.ts; src/services/notifications.ts'));
rows(s,[['Package selection','Clients need clear service details, prices and session requirements.'],['Schedule coordination','The studio needs available windows and checks for overlapping sessions.'],['Request tracking','Both sides need the same booking status and decision history.'],['Communication','Clients and photographers need notifications about booking activity.']],185,108);

s=slide('System objectives',note('The main implementation uses Supabase. The sibling PhotoSyncMobile repository is a local prototype and must not be used as evidence of main application payment or client verification features.','src/services; docs/supabase-setup.md; C:/Users/kirlg/PhotoSyncMobile/README.md'));
rows(s,[['Client booking','Support package, schedule, contact and review steps.'],['Studio control','Manage requests, catalog publication and calendar availability.'],['Access protection','Enforce client ownership and photographer permissions in the backend.'],['Consistent records','Keep shared booking data, notifications and status history.']],185,108);

s=slide('Technology stack',note('Versions shown are declared in the package configuration. Supabase hosts the PostgreSQL backend. There is no separate Express server in the main repository.','package.json; src/lib/supabase.ts; supabase/functions/send-push-notification/index.ts'));
rows(s,[['Mobile interface','Expo SDK 57, React Native 0.86.3 and React 19.2.3'],['Navigation and types','Expo Router with TypeScript'],['Backend','Supabase Auth, PostgreSQL, storage and database functions'],['Push delivery','Deno Edge Function and Expo Push Service']],185,108);

s=slide('Backend architecture',note('Describe the request sequence from screen to service to Supabase. The public client key is usable in the mobile app because backend policies protect data. The Edge Function uses a server credential for notification dispatch, which must never be bundled into the client.','src/lib/supabase.ts; src/services; docs/supabase-rls-hardening.sql'),true);
rows(s,[['Mobile screens','Screens call hooks and application services.'],['Application services','Validate inputs and send authenticated table queries or RPC calls.'],['Supabase','Authenticates users and applies database policies and constraints.'],['Shared state','Services return results and invalidate affected screen caches.']],185,108,true);

s=slide('Database relationships',note('One profile belongs to one auth user. A client has many bookings. A service has many packages and bookings reference the selected offering. Bookings have history entries and recipient notifications. UUID keys connect the records.','docs/supabase-schema.sql; docs/supabase-services-packages.sql; docs/supabase-push-notifications.sql'));
cols(s,[['Identity','auth.users\nprofiles\n\nUser account and trusted role'],['Booking','services\npackages\nbookings\ntime_slots'],['Supporting records','notifications\nbooking_status_history\naudit_logs\nstudio_settings\npush_tokens']]);

s=slide('Authentication and roles',note('Signup normalizes email and username and requires six password characters. The database trigger assigns client to new profiles. Admin promotion is trusted database work. Android native Google sign-in uses a nonce and Supabase token exchange. The generic platform implementation reports Android availability.','src/services/auth.ts; src/services/google-auth.android.ts; src/services/google-auth.ts; docs/supabase-rls-hardening.sql'));
rows(s,[['Account access','Email or username login, registration and password recovery'],['Client role','Own profile, own bookings and recipient notifications'],['Photographer role','Studio requests, calendar, catalog and settings'],['Google sign-in','Native Android account chooser with Supabase authentication']],185,108);

s=slide('Client booking flow',note('Demo this sequence. The draft lives in module memory. Submission rechecks the selected package, authentication, current rules, working hours and availability. A successful request is pending, not confirmed. A price change requires review again.','src/app/(client)/book; src/services/booking-draft.ts; src/services/bookings.ts'));
rows(s,[['01 Select a package','Review the service, price and session requirements.'],['02 Choose a schedule','Select a valid future date and available time.'],['03 Enter information','Provide contact details and session preferences.'],['04 Review and submit','The backend saves a pending request for photographer review.']],185,108);

s=slide('Photographer workflow',note('Status actions are conditional on expected previous status. Confirmation and rejection require pending. Completion requires confirmed. Rejection includes reason handling. The Clients route uses placeholder records, so do not present it as a live client directory.','src/services/admin-bookings.ts; src/app/photographer/requests/[id].tsx; src/app/photographer/clients.tsx'));
cols(s,[['Requests','Inspect session details.\n\nConfirm or reject pending requests.\n\nComplete finished sessions.'],['Availability','Set open windows.\n\nBlock dates and times.\n\nKeep past calendar dates read only.'],['Catalog','Create and edit services.\n\nManage package images.\n\nPublish or archive offerings.']]);

s=slide('Booking lifecycle',note('Cancellation currently allows the client own pending requests. Rescheduling pending or confirmed sessions returns the request to pending review. Expiration applies only to past due pending requests. The server clock uses Asia/Manila for expiration.','src/services/admin-bookings.ts; src/services/client-bookings.ts; docs/supabase-booking-expiration.sql'));
rows(s,[['pending','A new request awaits a photographer decision.'],['confirmed or rejected','The photographer accepts or declines a pending request.'],['completed','The photographer marks a confirmed session finished.'],['cancelled or expired','A client cancels a pending request, or its start time passes.']],185,108);

s=slide('Conflict prevention',note('The application validates duration, minimum notice, buffered intervals, unavailable slots and working hours. Conditional writes prevent stale status actions. The PostgreSQL GiST exclusion constraint prevents overlapping confirmed intervals. This constraint does not implement every preparation buffer rule, and pending requests are not guaranteed reservations.','src/services/bookings.ts; src/services/admin-bookings.ts; docs/supabase-confirmed-booking-conflict-protection.sql'));
text(s,'Availability checks happen again\nbefore a booking decision',74,185,1050,140,43,C.navy,true);
cols(s,[['Service rules','Duration, minimum notice and preparation buffer'],['Studio rules','Open windows, blocked times and current working hours'],['Database protection','Expected status filters and a confirmed overlap constraint']]);
// Move this slide's columns below the statement.
for(const sh of s.shapes.items.slice(-6))sh.position={...sh.position,top:sh.position.top+160,height:sh.position.height===265?115:sh.position.height};

s=slide('Notifications and reminders',note('A notification database row is separate from push delivery. The documented hourly database job creates next day reminders in Asia/Manila time, with duplicate prevention. The dispatcher uses get_active_push_tokens_for_user and sends through Expo. A sent count proves submission attempts rather than device display. The actual webhook, credentials and devices require separate verification.','src/services/notifications.ts; docs/supabase-scheduled-booking-reminders.sql; docs/supabase-reminder-schedule.sql; supabase/functions/send-push-notification/index.ts'));
rows(s,[['In app inbox','Booking activity appears in recipient notification records.'],['Scheduled reminders','An hourly database job selects tomorrow confirmed sessions.'],['Push dispatcher','An Edge Function sends to active recipient device sessions.'],['Delivery boundary','Submission to Expo does not prove display on every device.']],185,108);

s=slide('Security and privacy',note('RLS is the real authorization boundary. Both image buckets currently permit public reads, with restricted writes. AsyncStorage is the configured session adapter, not proof of secure hardware backed storage. PUSH_WEBHOOK_SECRET is enforced when configured. Some booking, history and notification writes occur in separate calls and are not one transaction.','docs/supabase-rls-hardening.sql; docs/supabase-profile-images.sql; docs/supabase-service-images.sql; src/lib/supabase.ts; supabase/functions/send-push-notification/index.ts'));
rows(s,[['Database authorization','Row level security checks ownership and admin permissions.'],['Server credentials','Service keys and private provider secrets stay outside the app.'],['Account isolation','Session scoped caches reject obsolete account responses.'],['Image visibility','Avatar and catalog buckets allow public reads.']],185,108);

s=slide('Performance and reliability',note('The service layer coalesces concurrent reads and uses request generations to discard stale results. The catalog still loads a complete snapshot in stable pages, so UI virtualization does not reduce total catalog snapshot size. Caches do not provide offline write synchronization.','docs/shared-service-optimization.md; src/services/booking-pages.ts; src/services/session-read-cache.ts'));
rows(s,[['30 bookings per page','Cursor paging keeps list responses bounded.'],['Shared cached reads','Browsing reuses data while critical actions force fresh validation.'],['Virtualized catalog','FlatList limits the cards rendered at the same time.'],['Stale response guards','Old requests cannot repopulate a different account.']],185,108);

s=slide('Testing evidence',note('These are checks completed during preparation of the Word guide on October 9 2026. The JavaScript test run passed 473 tests with zero failures. TypeScript and Expo lint passed. SQL fixture checks and deployments described in October 7 notes are historical records and were not rerun for the deck. Physical device verification remains necessary.','scripts/*.test.cjs; docs/shared-service-optimization.md; docs/calendar-date-guards.md'),true);
text(s,'473',74,185,650,180,145,C.white,true);
text(s,'automated tests passed',80,385,1000,65,42,C.white);
text(s,'Expo lint and TypeScript checks passed',80,477,1050,65,30,C.pale);
text(s,'Device behavior and live delivery still require verification',80,567,1050,70,27,C.pale);

s=slide('Current limitations',note('Be explicit when the panel asks about scope. The separate PhotoSyncMobile local prototype describes payment states and client verification, but that does not establish those functions in the main Supabase app. Some critical timezone helpers use local device dates, which warrants consistency testing. Other future improvements include transactional mutations and push receipt processing.','src/app/photographer/clients.tsx; src/services/google-auth.ts; src/services/booking-draft.ts; C:/Users/kirlg/PhotoSyncMobile/README.md'));
rows(s,[['Clients directory','The current screen uses sample records.'],['Payments and galleries','The main app does not implement payment processing or photo delivery.'],['Platform coverage','Google sign-in is Android specific. Device testing remains necessary.'],['Offline use','Authoritative bookings require connectivity. Drafts stay in memory.']],185,108);

s=slide('Demonstration sequence',note('Prepare a client and an admin account, a published package, a future date meeting minimum notice and a correct native build. Show the pending state, switch to the photographer, decide the request, then return to the client and refresh. Only show push and Google if the exact device configuration has been verified.','src/app/(client)/book; src/app/photographer/requests; src/services/auth.ts'));
rows(s,[['Client','Sign in, choose a package and submit a future session request.'],['Photographer','Open the request and confirm or reject it.'],['Client result','Refresh the booking and notification inbox.'],['Studio controls','Show future availability and catalog management.']],185,108);

s=slide('Conclusion',note('Close with the actual completed scope. PhotoSync connects a mobile booking workflow to a shared backend and studio management tools. Invite questions about access policies, conflicting requests, reminders and cache freshness. Do not claim performance measurements or deployment guarantees absent from the evidence.','src/services; docs/supabase-setup.md'),true);
text(s,'A shared booking workflow\nfor clients and photographers',74,200,1115,170,56,C.white,true);
text(s,'Mobile requests, studio availability and backend access controls',78,420,1060,100,32,C.pale);
text(s,'Questions',78,582,1000,70,40,C.white,true);

await fs.mkdir(root+'/build/previews',{recursive:true});
await fs.mkdir(root+'/build/finalization',{recursive:true});
const candidate=root+'/build/candidate.pptx';
await(await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){
 const b=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(root+`/build/previews/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await b.arrayBuffer()));
 console.log('Rendered',i+1);
}
await fs.writeFile(root+'/build/inspection.ndjson',(await p.inspect({kind:'slide,textbox,notes',maxChars:100000})).ndjson);
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:root+'/output/PhotoSync_Defense.pptx',pythonExecutable:'C:/Users/kirlg/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],fontPolicy:{basis:'design',families:['Calibri']},verifyArtifactToolImport:true,receiptPath:root+'/build/finalization/validation.json'});
console.log(JSON.stringify(result));

