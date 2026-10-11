import { finalizePresentation } from 'file:///C:/Users/kirlg/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root='C:/Users/kirlg/PhotoSync/tmp/defense-ppt';
const skill='C:/Users/kirlg/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const candidate=root+'/build/candidate.pptx';
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:root+'/output/PhotoSync_Defense.pptx',pythonExecutable:'C:/Users/kirlg/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:skill+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:skill+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],fontPolicy:{basis:'design',families:['Calibri']},verifyArtifactToolImport:true,receiptPath:root+'/build/finalization/validation.json'});
console.log(JSON.stringify(result));


