import { 
  Client, GatewayIntentBits, Events, Partials, Message, 
  REST, Routes, SlashCommandBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, 
  ModalActionRowComponentBuilder, ChannelType, ThreadAutoArchiveDuration,
  Collection, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ComponentType
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// ===== 配置区域 =====
const VERIFIED_ROLE_ID = '1419966562206748746';
const LOG_CHANNEL_ID = '1494155222241509476';
const THREAD_CHANNEL_ID = '1494158013446094898';
const ADMIN_USER_ID = '766273325827620865';
const TARGET_INVITE_CODE = 'ry7WFbDCwj';
const INVITE_REWARD_ROLE_ID = '1494174141559865354';
const BIRTHDAY_CHANNEL_ID = '1494158013446094898';
const BIRTHDAY_LOG_CHANNEL_ID = '1496428931174105158';
// ===================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel]
});

const invitesCache = new Collection<string, Collection<string, number>>();

// ✅ 新增：记录已登记生日的用户（防止重复，Bot重启后清空，持久化靠n8n表格）
const birthdayRegistered = new Map<string, boolean>();

const commands = [
  new SlashCommandBuilder()
    .setName('events')
    .setDescription('View hidden event locations')
    .addSubcommand(sub => sub.setName('map').setDescription('Find the hidden map'))
    .addSubcommand(sub => sub.setName('hub').setDescription('Find the hidden hub')),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Start the verification process to claim extra rewards'),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a custom embed message with a verify button (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option => option.setName('title').setDescription('The title of the embed').setRequired(true))
    .addStringOption(option => option.setName('description').setDescription('The main text of the embed').setRequired(true))
    .addStringOption(option => option.setName('button_text').setDescription('The text displayed on the button').setRequired(true)),

  // ✅ 新增：生日登记指令
  new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Register your birthday to receive exclusive birthday rewards!')
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Your birthday in yyyy-mm-dd format, e.g. 1995-05-01')
        .setRequired(true)
    )
];

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot is online! Logged in as ${c.user.tag}`);

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const invites = await guild.invites.fetch();
      const codeUses = new Collection<string, number>();
      invites.forEach(inv => codeUses.set(inv.code, inv.uses || 0));
      invitesCache.set(guildId, codeUses);
    } catch (err) {
      console.warn(`⚠️ Cannot fetch invites for guild ${guild.name}`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands.map(cmd => cmd.toJSON()) });
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = invitesCache.get(member.guild.id);
    if (oldInvites) {
      const usedInvite = newInvites.find(i => (i.uses || 0) > (oldInvites.get(i.code) || 0));
      if (usedInvite && usedInvite.code === TARGET_INVITE_CODE) {
        const role = member.guild.roles.cache.get(INVITE_REWARD_ROLE_ID);
        if (role) await member.roles.add(role);
      }
    }
    const codeUses = new Collection<string, number>();
    newInvites.forEach(inv => codeUses.set(inv.code, inv.uses || 0));
    invitesCache.set(member.guild.id, codeUses);
  } catch (error) {
    console.error('❌ Error in GuildMemberAdd:', error);
  }
});

function createVerifyModal() {
  const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Player Verification');
  const gameInfoInput = new TextInputBuilder().setCustomId('game_info').setLabel('Please leave your game info').setStyle(TextInputStyle.Short).setRequired(true);
  const emailInfoInput = new TextInputBuilder().setCustomId('email_info').setLabel('Please leave your email info').setStyle(TextInputStyle.Short).setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(gameInfoInput),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(emailInfoInput)
  );
  return modal;
}

client.on(Events.InteractionCreate, async (interaction) => {

  // ===== 斜杠指令 =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'events') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'map') await interaction.reply({ content: 'dear user, congratulations you found out the hidden map', ephemeral: true });
      if (sub === 'hub') await interaction.reply({ content: 'dear user, congratulations you found out the hidden hub', ephemeral: true });
    }

    if (interaction.commandName === 'verify') {
      await interaction.showModal(createVerifyModal());
    }

    if (interaction.commandName === 'embed') {
      const title = interaction.options.getString('title')!;
      const description = interaction.options.getString('description')!;
      const buttonText = interaction.options.getString('button_text')!;
      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x0099FF);
      const verifyButton = new ButtonBuilder().setCustomId('trigger_verify_modal').setLabel(buttonText).setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);
      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ✅ 新增：生日登记指令处理
    if (interaction.commandName === 'birthday') {

      // 限制只在指定频道使用
      if (interaction.channelId !== BIRTHDAY_CHANNEL_ID) {
        await interaction.reply({
          content: 'Please use this command in the designated birthday channel!',
          ephemeral: true
        });
        return;
      }

      const dateInput = interaction.options.getString('date')!;

      // 验证日期格式 yyyy-mm-dd
      const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
      if (!dateRegex.test(dateInput)) {
        await interaction.reply({
          content: 'Invalid date format! Please use **yyyy-mm-dd**, e.g. `1995-05-01`',
          ephemeral: true
        });
        return;
      }

      const user = interaction.user;
      const registeredAt = new Date().toISOString();
      const isUpdate = birthdayRegistered.get(user.id) ?? false;

      // 记录到内存（覆盖旧的）
      birthdayRegistered.set(user.id, true);

      // 回复玩家
      await interaction.reply({
        content: isUpdate
          ? `Your birthday has been updated to **${dateInput}**! 🎂 Your exclusive birthday rewards will be sent on your special day!`
          : `Your birthday (**${dateInput}**) has been registered! 🎂 Your exclusive birthday rewards will be waiting for you on your special day!`,
        ephemeral: true
      });

      // 推送记录到 Birthday Log 频道
      try {
        const logChannel = await client.channels.fetch(BIRTHDAY_LOG_CHANNEL_ID);
        if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🎂 Birthday Registration')
            .setColor(0xFF69B4)
            .addFields(
              { name: 'Discord User', value: `<@${user.id}>`, inline: true },
              { name: 'Discord ID', value: user.id, inline: true },
              { name: 'Birthday', value: dateInput, inline: true },
              { name: 'Registered At', value: registeredAt, inline: true },
              { name: 'Status', value: isUpdate ? '🔄 Updated' : '✅ New Registration', inline: true }
            );
          // @ts-ignore
          await logChannel.send({ embeds: [logEmbed] });
        }
      } catch (error) {
        console.error('❌ Error sending birthday log:', error);
      }

      // 推送到 n8n（与现有 webhook 共用，action 字段区分）
      try {
        const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
        if (N8N_FORM_WEBHOOK_URL) {
          await fetch(N8N_FORM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'birthday_register',
              userId: user.id,
              userTag: user.tag,
              birthday: dateInput,
              registeredAt,
              isUpdate
            })
          });
        }
      } catch (error) {
        console.error('❌ Error sending birthday to n8n:', error);
      }
    }
  }

  // ===== 按钮点击 =====
  if (interaction.isButton()) {
    if (interaction.customId === 'trigger_verify_modal') {
      await interaction.showModal(createVerifyModal());
    }

    // ✅ 新增：生日福利领取按钮
    if (interaction.customId === 'claim_birthday_gift') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('birthday_gift_select')
        .setPlaceholder('Choose your birthday gift...')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Discounted Skin')
            .setDescription('Exclusive discounted skin for your birthday!')
            .setValue('skin'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Gacha Ticket')
            .setDescription('Try your luck with gacha tickets!')
            .setValue('gacha'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Mystery Box')
            .setDescription('Surprise yourself with a mystery box!')
            .setValue('box')
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await interaction.reply({
        content: '🎁 Choose your birthday gift! Select one option below:',
        components: [row],
        ephemeral: true
      });
    }
  }

  // ===== Select Menu 选择 =====
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'birthday_gift_select') {
      const selected = interaction.values[0]; // 'skin' | 'gacha' | 'box'
      const user = interaction.user;

      const giftNames: Record<string, string> = {
        skin: 'Discounted Skin',
        gacha: 'Gacha Ticket',
        box: 'Mystery Box'
      };

      // 先告知玩家正在处理
      await interaction.reply({
        content: `🎂 Great choice! Fetching your **${giftNames[selected]}** code, please wait a moment...`,
        ephemeral: true
      });

      // 请求 n8n 发放生日礼包码
      try {
        const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
        if (N8N_FORM_WEBHOOK_URL) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(N8N_FORM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'birthday_claim_code',
              userId: user.id,
              userTag: user.tag,
              giftType: selected, // 'skin' | 'gacha' | 'box'
              timestamp: new Date().toISOString()
            }),
            signal: controller.signal
          });

          clearTimeout(timeout);

          const rawText = await response.text();
          console.log('🎂 Birthday gift code response:', rawText);
          const result = (rawText ? JSON.parse(rawText) : {}) as { code?: string; row_number?: number };

          if (result && result.code) {
            await interaction.editReply(
              `🎂 Happy Birthday! Here is your **${giftNames[selected]}** gift code:\n\n**${result.code}**\n\nEnjoy your special day! 🎉`
            );

            // 通知 n8n 标记礼包码为已使用
            await fetch(N8N_FORM_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'birthday_confirm_code',
                code: result.code,
                row_number: result.row_number,
                giftType: selected,
                userId: user.id,
                timestamp: new Date().toISOString()
              })
            });
          } else {
            await interaction.editReply(
              `🎂 Happy Birthday! Unfortunately we are currently out of **${giftNames[selected]}** codes. Please contact a GM for your reward! 💝`
            );
          }
        }
      } catch (error) {
        console.error('❌ Error fetching birthday gift code:', error);
        await interaction.editReply('Something went wrong while fetching your gift code. Please contact a GM for assistance! 💝');
      }
    }
  }

  // ===== Modal 提交 =====
  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const gameInfo = interaction.fields.getTextInputValue('game_info');
    const emailInfo = interaction.fields.getTextInputValue('email_info');
    const user = interaction.user;
    const guild = interaction.guild;

    await interaction.reply({
      content: 'Verification submitted! Please wait a moment while we fetch your extra reward code...',
      ephemeral: true
    });

    try {
      const member = await guild?.members.fetch(user.id);
      const role = guild?.roles.cache.get(VERIFIED_ROLE_ID);
      if (member && role) await member.roles.add(role);
    } catch (error) { console.error('❌ Error assigning role:', error); }

    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
        const logEmbed = new EmbedBuilder().setTitle('📋 New Verification Submission').setColor(0x00C851)
          .addFields(
            { name: 'Discord User', value: `<@${user.id}>`, inline: true },
            { name: 'Discord ID', value: user.id, inline: true },
            { name: 'Game Info', value: gameInfo },
            { name: 'Email Info', value: emailInfo },
            { name: 'Submitted At', value: new Date().toISOString(), inline: true }
          );
        // @ts-ignore
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {}

    try {
      const threadChannel = await client.channels.fetch(THREAD_CHANNEL_ID);
      if (threadChannel?.isTextBased() && !threadChannel.isDMBased() && 'threads' in threadChannel) {
        const threadName = gameInfo.slice(0, 100);
        const thread = await (threadChannel as any).threads.create({
          name: threadName, type: ChannelType.PrivateThread,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek, invitable: false,
        });
        await thread.members.add(user.id);
        await thread.members.add(ADMIN_USER_ID);
        await thread.send(`<@${user.id}> pls wait... gm will contact you soon`);
      }
    } catch (error) {}

    try {
      const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
      if (N8N_FORM_WEBHOOK_URL) {
        const requestBody = {
          action: 'request_code',
          userId: user.id, userTag: user.tag, gameInfo, emailInfo, timestamp: new Date().toISOString()
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(N8N_FORM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) throw new Error(`n8n responded with status ${response.status}`);

        const rawText = await response.text();
        console.log('📦 n8n raw response:', rawText);
        const result = (rawText ? JSON.parse(rawText) : {}) as { code?: string; row_number?: number };

        if (result && result.code) {
          await interaction.editReply(`Your verify is completed! 🎉\nHere is your extra reward code: **${result.code}**\n\nPls wait... gm will contact you later with extra info.`);

          // 移除 wait role
          try {
            const member = await guild?.members.fetch(user.id);
            const waitRole = guild?.roles.cache.get(INVITE_REWARD_ROLE_ID);
            if (member && waitRole) await member.roles.remove(waitRole);
          } catch (error) { console.error('❌ Error removing wait role:', error); }

          await fetch(N8N_FORM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'confirm_code',
              code: result.code,
              row_number: result.row_number,
              userId: user.id,
              timestamp: new Date().toISOString()
            })
          });
        } else {
          await interaction.editReply('Your verify is completed, but we are currently out of automated gift codes. Please wait... gm will contact you later with extra rewards.');
        }
      }
    } catch (error) {
      console.error('❌ Error handling n8n gift code flow:', error);
      await interaction.editReply('Your verify is completed! (Notice: automated code system delayed, GM will send rewards manually)');
    }
  }
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  if (message.channel.isDMBased()) {
    try {
      const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
      if (N8N_WEBHOOK_URL) {
        await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'direct_message', userId: message.author.id, message: message.content })
        });
      }
    } catch (error) { console.error('❌ Error handling DM:', error); }

  } else if (message.mentions.has(client.user!.id)) {
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
    if (N8N_WEBHOOK_URL) {
      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'channel_mention', userId: message.author.id,
          message: message.content, channelId: message.channel.id
        })
      });
    }
  }
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error('❌ Error: DISCORD_BOT_TOKEN is not defined'); process.exit(1); }
client.login(token);
