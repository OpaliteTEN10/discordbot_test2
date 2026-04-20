import { 
  Client, GatewayIntentBits, Events, Partials, Message, 
  REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, 
  ModalActionRowComponentBuilder, ChannelType, ThreadAutoArchiveDuration,
  Collection // ✅ 新增：用于缓存邀请链接状态
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

// ===== 配置区域 =====
const VERIFIED_ROLE_ID = '1419966562206748746';
const LOG_CHANNEL_ID = '1494155222241509476';
const THREAD_CHANNEL_ID = '1494158013446094898';
const ADMIN_USER_ID = '766273325827620865';

// ✅ 新增配置：邀请奖励
const TARGET_INVITE_CODE = 'ry7WFbDCwj';
const INVITE_REWARD_ROLE_ID = '1494174141559865354';
// ===================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // 监听成员加入
    GatewayIntentBits.GuildInvites  // ✅ 新增：监听邀请链接使用情况
  ],
  partials: [Partials.Channel]
});

// ✅ 缓存所有服务器的邀请链接使用次数
const invitesCache = new Collection<string, Collection<string, number>>();

// ✅ 定义斜杠指令 (保留原有)
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
    .addStringOption(option => option.setName('button_text').setDescription('The text displayed on the button').setRequired(true))
];

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot is online! Logged in as ${c.user.tag}`);
  
  // ✅ 启动时缓存所有邀请链接
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

// ✅ 新增：监听新成员加入，检查邀请链接并分配 Role
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = invitesCache.get(member.guild.id);
    
    if (oldInvites) {
      // 对比找出使用次数增加的那个链接
      const usedInvite = newInvites.find(i => (i.uses || 0) > (oldInvites.get(i.code) || 0));
      
      if (usedInvite && usedInvite.code === TARGET_INVITE_CODE) {
        console.log(`🎉 ${member.user.tag} joined using target invite code! Assigning role...`);
        const role = member.guild.roles.cache.get(INVITE_REWARD_ROLE_ID);
        if (role) await member.roles.add(role);
      }
    }
    // 更新缓存
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
  if (interaction.isChatInputCommand()) {
    // ... 保留你原有的 commands 判断逻辑 ...
    if (interaction.commandName === 'events') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'map') await interaction.reply({ content: 'dear user, congratulations you found out the hidden map', ephemeral: true });
      if (sub === 'hub') await interaction.reply({ content: 'dear user, congratulations you found out the hidden hub', ephemeral: true });
    }
    if (interaction.commandName === 'verify') await interaction.showModal(createVerifyModal());
    if (interaction.commandName === 'embed') {
      const title = interaction.options.getString('title')!;
      const description = interaction.options.getString('description')!;
      const buttonText = interaction.options.getString('button_text')!;
      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x0099FF);
      const verifyButton = new ButtonBuilder().setCustomId('trigger_verify_modal').setLabel(buttonText).setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);
      await interaction.reply({ embeds: [embed], components: [row] });
    }
  }

  if (interaction.isButton() && interaction.customId === 'trigger_verify_modal') {
    await interaction.showModal(createVerifyModal());
  }

  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const gameInfo = interaction.fields.getTextInputValue('game_info');
    const emailInfo = interaction.fields.getTextInputValue('email_info');
    const user = interaction.user;
    const guild = interaction.guild;

    // ✅ 修改点：先发送缓冲消息，防止超时
    await interaction.reply({
      content: 'Verification submitted! Please wait a moment while we fetch your extra reward code...',
      ephemeral: true
    });

    // ===== 需求1：给玩家分配 Role (保留) =====
    try {
      const member = await guild?.members.fetch(user.id);
      const role = guild?.roles.cache.get(VERIFIED_ROLE_ID);
      if (member && role) await member.roles.add(role);
    } catch (error) { console.error('❌ Error assigning role:', error); }

    // ===== 需求2：推送记录到 Log 频道 (保留) =====
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

    // ===== 需求3：在指定频道创建 Private Thread (保留) =====
    try {
      const threadChannel = await client.channels.fetch(THREAD_CHANNEL_ID);
      if (threadChannel?.isTextBased() && !threadChannel.isDMBased() && 'threads' in threadChannel) {
        const threadName = gameInfo.slice(0, 100);
        const thread = await (threadChannel as any).threads.create({
          name: threadName, type: ChannelType.PrivateThread, autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek, invitable: false,
        });
        await thread.members.add(user.id);
        await thread.members.add(ADMIN_USER_ID);
        await thread.send(`<@${user.id}> wait no longer... gm will contact you soon`);
      }
    } catch (error) {}

    // ===== 全新升级需求：连接 n8n 拿礼包码并确认记录 =====
    try {
      const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
      if (N8N_FORM_WEBHOOK_URL) {
        // 第一步：向 n8n 请求一个礼包码
        const requestBody = {
          action: 'request_code', // ✅ 告诉 n8n 这是要拿码
          userId: user.id, userTag: user.tag, gameInfo, emailInfo, timestamp: new Date().toISOString()
        };
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超时
        
        const response = await fetch(N8N_FORM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        // 先检查响应状态
        if (!response.ok) {
          throw new Error(`n8n responded with status ${response.status}`);
        }
        
        const rawText = await response.text();
        console.log('📦 n8n raw response:', rawText);
        
        const result = (rawText ? JSON.parse(rawText) : {}) as { code?: string; row_number?: number };
        
        if (result && result.code) {
          await interaction.editReply(`Your verify is completed! 🎉\nHere is your extra reward code: **${result.code}**\n\nWait no longer... gm will contact you later with extra info.`);
        
          // 发 confirm 时带上 row_number
          await fetch(N8N_FORM_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'confirm_code',
              code: result.code,
              row_number: result.row_number,  // ← 加这个
              userId: user.id,
              timestamp: new Date().toISOString()
            })
          });
        } else {
          // 如果 n8n 表格没码了，或者出错了
          await interaction.editReply('Your verify is completed, but we are currently out of automated gift codes. Please wait... gm will contact you later with extra rewards.');
        }
      }
    } catch (error) {
      console.error('❌ Error handling n8n gift code flow:', error);
      await interaction.editReply('Your verify is completed! (Notice: automated code system delayed, GM will send rewards manually)');
    }
  }
});

// ✅ 保留原有的私信和@提及功能... (完全保留，代码省略以免过长，你直接用你原来的即可)
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;
  // ... 此处保留你原有的 n8n DM 和 Mention 代码 ...
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error('❌ Error: DISCORD_BOT_TOKEN is not defined'); process.exit(1); }
client.login(token);
