import { readFile } from 'node:fs/promises'
import { parse } from 'jsonc-parser'
import { registerCommands, commands } from '../local/commands.mjs'
const config = parse(await readFile(new URL('../worker/wrangler.jsonc', import.meta.url),'utf8')).vars
const dryRun=process.argv.includes('--dry-run')
const seen=new Set()
for(const command of commands){
 if(seen.has(command.name)||!/^[-a-z0-9]{1,32}$/.test(command.name)||command.description.length>100)throw Error('INVALID_COMMAND_SCHEMA')
 seen.add(command.name)
 let optional=false
 for(const option of command.options||[]){if(!option.required)optional=true;else if(optional)throw Error('REQUIRED_OPTION_AFTER_OPTIONAL')}
}
if(dryRun)console.log('Validated '+commands.length+' management command schemas; no Discord access.')
else{
 if(!process.env.DISCORD_NOTIFIER_BOT_TOKEN)throw Error('Set DISCORD_NOTIFIER_BOT_TOKEN in Actions Secrets')
 await registerCommands({token:process.env.DISCORD_NOTIFIER_BOT_TOKEN,applicationId:config.DISCORD_APPLICATION_ID,guildId:config.DISCORD_GUILD_ID})
}
