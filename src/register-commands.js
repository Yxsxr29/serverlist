const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');

const commands = [
  new SlashCommandBuilder()
    .setName('finalcity')
    .setDescription('Zeigt die aktuelle Final City Spielerliste')
    .addStringOption((option) =>
      option
        .setName('suche')
        .setDescription('Optionaler Suchstring, z.B. madrazo, cali, zivi')
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('history')
        .setDescription('Auch Offline-/History-Einträge anzeigen')
        .setRequired(false)
    )
].map((command) => command.toJSON());

async function main() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  console.log('Registriere Slash Commands...');

  await rest.put(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    { body: commands }
  );

  console.log('Slash Commands erfolgreich registriert.');
}

main().catch((error) => {
  console.error('Fehler beim Registrieren der Slash Commands:', error);
  process.exit(1);
});
