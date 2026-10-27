// Runs MTM Player's own installed-pack verification against a team workspace.
import { pathToFileURL } from 'node:url';
const [playerApp, workspace] = process.argv.slice(2);
const { verifyTeamRuntime } = await import(pathToFileURL(`${playerApp}/src/team-install.mjs`).href);
console.log(JSON.stringify(verifyTeamRuntime({ teamWorkspace: workspace, teamSdlcPackWorkspace: `${workspace}\\team-sdlc-pack` })));
