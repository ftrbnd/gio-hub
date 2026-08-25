import { REST } from 'discord.js';

export const discordRest = new REST({ version: '10' }).setToken(
	process.env.DISCORD_BOT_TOKEN as string,
);
