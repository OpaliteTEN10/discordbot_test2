import { 
  Client, GatewayIntentBits, Events, Partials, Message, 
  REST, Routes, SlashCommandBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, 
  ModalActionRowComponentBuilder, ChannelType, ThreadAutoArchiveDuration,
  Collection, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
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
// const BIRTHDAY_CHANNEL_ID = '1494158013446094898';  // 暂时隐藏
// const BIRTHDAY_LOG_CHANNEL_ID = '1496428931174105158'; // 暂时隐藏
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
// const birthdayRegistered = new Map<string, boolean>(); // 暂时隐藏

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
  .addStringOption(option => 
    option.setName('image_url')
      .setDescription('URL of the guide image to display in the embed')
      .setRequired(false)  // 可选，不填就没有图片
  ),

  // ✅ birthday 指令暂时隐藏，需要时取消注释
  // new SlashCommandBuilder()
  //   .setName('birthday')
  //   .setDescription('Register your birthday to receive exclusive birthday rewards!')
  //   .addStringOption(option =>
  //     option.setName('date')
  //       .setDescription('Your birthday in yyyy-mm-dd format, e.g. 1995-05-01')
  //       .setRequired(true)
  //   ),

  new SlashCommandBuilder()
    .setName('getcode')
    .setDescription('Get an unused gift code (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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

// ✅ 邀请链接追踪，不变
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

// ✅ 验证表单，不变
function createVerifyModal() {
  const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Player Verification');
  const gameInfoInput = new TextInputBuilder()
    .setCustomId('game_info')
    .setLabel('Please leave your game info')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const emailInfoInput = new TextInputBuilder()
    .setCustomId('email_info')
    .setLabel('Please leave your email info')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
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
  const imageUrl = interaction.options.getString('image_url'); // 新增

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x0099FF);

  // ✅ 新增：如果有图片URL就加进去
  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  const verifyButton = new ButtonBuilder()
    .setCustomId('trigger_verify_modal')
    .setLabel(buttonText)
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);
  await interaction.reply({ embeds: [embed], components: [row] });
}
    // ✅ birthday 指令处理暂时隐藏，需要时取消注释
    // if (interaction.commandName === 'birthday') { ... }

    // ✅ getcode 指令
    if (interaction.commandName === 'getcode') {
      await interaction.reply({ content: 'Fetching a gift code, please wait...', ephemeral: true });
      try {
        const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
        if (!N8N_FORM_WEBHOOK_URL) throw new Error('Webhook URL not set');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(N8N_FORM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'admin_get_code',
            requestedBy: interaction.user.tag,
            requestedById: interaction.user.id,
            timestamp: new Date().toISOString()
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);
        const rawText = await response.text();
        console.log('🔑 Admin getcode response:', rawText);
        const result = (rawText ? JSON.parse(rawText) : {}) as { code?: string; message?: string };

        if (result.code) {
        await interaction.editReply(
          `✅ **Gift Code:**\n\`\`\`\n${result.code}\n\`\`\`\n📋 **Ready-to-send message** (copy and send to player):\n\`\`\`\n${result.message}\n\`\`\`\n⚠️ This code has been marked as **used**.`
        );
      } else {
          await interaction.editReply(result.message || '❌ No unused codes available. Please add more codes to the sheet.');
        }
      } catch (error) {
        console.error('❌ Error fetching admin code:', error);
        await interaction.editReply('❌ Failed to fetch code. Please try again or check n8n.');
      }
    }
  }

  // ===== 按钮点击 =====
  if (interaction.isButton()) {
    if (interaction.customId === 'trigger_verify_modal') {
      await interaction.showModal(createVerifyModal());
    }

    // ✅ birthday 按钮处理暂时隐藏，需要时取消注释
    // if (interaction.customId === 'claim_birthday_gift') { ... }
  }

  // ===== Select Menu 暂时隐藏，需要时取消注释 =====
  // if (interaction.isStringSelectMenu()) { ... }

  // ===== Modal 提交 =====
  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    const gameInfo = interaction.fields.getTextInputValue('game_info');
    const emailInfo = interaction.fields.getTextInputValue('email_info');
    const user = interaction.user;
    const guild = interaction.guild;

    await interaction.reply({
      content: 'Verification submitted! Please wait while we process your information...',
      ephemeral: true
    });

    try {
      const N8N_FORM_WEBHOOK_URL = process.env.N8N_FORM_WEBHOOK_URL;
      if (!N8N_FORM_WEBHOOK_URL) throw new Error('Webhook URL not set');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(N8N_FORM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_code',
          userId: user.id,
          userTag: user.tag,
          gameInfo,
          emailInfo,
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!response.ok) throw new Error(`n8n responded with status ${response.status}`);

      const rawText = await response.text();
      console.log('📦 n8n raw response:', rawText);

      const result = (rawText ? JSON.parse(rawText) : {}) as {
        status?: string;    // 'already_verified' | 'uid_not_found' | 'no_reward' | 'success'
        vipLevel?: string;
      };
      // ✅ UID 已验证过
      if (result.status === 'already_verified') {
        await interaction.editReply(
          'This UID has already been used for verification, please do not submit repeatedly.'
        );
        return;
      }
      // ✅ 新增：UID 在VIP名单里找不到
      if (result.status === 'uid_not_found') {
        await interaction.editReply(
          'There seems to be some error with your info, please recheck your UID.'
        );
        return;
      }
      // ✅ VIP 等级不足
      if (result.status === 'no_reward') {
        await interaction.editReply('No rewards available now.');
        return;
      }

      // ✅ 验证通过
      if (result.status === 'success') {
        const vipLevel = result.vipLevel || '';

        await interaction.editReply(
          'Your info has been verified! ✅ Please wait patiently, admin will send you the gift code soon.'
        );

        // 分配 verified role
        try {
          const member = await guild?.members.fetch(user.id);
          const role = guild?.roles.cache.get(VERIFIED_ROLE_ID);
          if (member && role) await member.roles.add(role);
        } catch (error) { console.error('❌ Error assigning role:', error); }

        // 移除 wait role
        try {
          const member = await guild?.members.fetch(user.id);
          const waitRole = guild?.roles.cache.get(INVITE_REWARD_ROLE_ID);
          if (member && waitRole) await member.roles.remove(waitRole);
        } catch (error) { console.error('❌ Error removing wait role:', error); }

        // 推送验证记录到 Log 频道
        try {
          const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
          if (logChannel?.isTextBased() && !logChannel.isDMBased()) {
            const logEmbed = new EmbedBuilder()
              .setTitle('📋 New Verification Submission').setColor(0x00C851)
              .addFields(
                { name: 'Discord User', value: `<@${user.id}>`, inline: true },
                { name: 'Discord ID', value: user.id, inline: true },
                { name: 'VIP Level', value: vipLevel || 'N/A', inline: true },
                { name: 'Game Info', value: gameInfo },
                { name: 'Email Info', value: emailInfo },
                { name: 'Submitted At', value: new Date().toISOString(), inline: true }
              );
            // @ts-ignore
            await logChannel.send({ embeds: [logEmbed] });
          }
        } catch (error) { console.error('❌ Error sending log:', error); }

        // 建立私密 Thread，标题格式 [VIP等级] [游戏信息]
        try {
          const threadChannel = await client.channels.fetch(THREAD_CHANNEL_ID);
          if (threadChannel?.isTextBased() && !threadChannel.isDMBased() && 'threads' in threadChannel) {
            const threadName = `[${vipLevel}] ${gameInfo}`.slice(0, 100);
            const thread = await (threadChannel as any).threads.create({
              name: threadName,
              type: ChannelType.PrivateThread,
              autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
              invitable: false,
            });
            await thread.members.add(user.id);
            await thread.members.add(ADMIN_USER_ID);
            await thread.send(
              `<@${user.id}> your info has been verified, pls wait patiently, admin will send you the giftcode soon`
            );
          }
        } catch (error) { console.error('❌ Error creating thread:', error); }

      } else {
        await interaction.editReply(
          'Something went wrong during verification. Please contact an admin for assistance.'
        );
      }

    } catch (error) {
      console.error('❌ Error handling verification:', error);
      await interaction.editReply(
        'Verification failed due to a system error. Please try again later or contact an admin.'
      );
    }
  }
});

// ✅ 私信和@提及，不变
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  if (message.channel.isDMBased()) {
    try {
      const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
      if (N8N_WEBHOOK_URL) {
        await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'direct_message',
            userId: message.author.id,
            message: message.content
          })
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
          type: 'channel_mention',
          userId: message.author.id,
          message: message.content,
          channelId: message.channel.id
        })
      });
    }
  }
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error('❌ Error: DISCORD_BOT_TOKEN is not defined'); process.exit(1); }
client.login(token);
