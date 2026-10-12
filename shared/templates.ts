import { boardSchema, type Board } from './board';
import { chapterTemplates } from './chapterTemplates';

export const templateCategories = ['对话交锋', '行为互动', '场景转折', '多人博弈', '情感关系', '成长逆袭'] as const;
export const templateScopes = {
  chapter: { label: '章内套路', description: '一次对话、一个动作或单场景的小转折；用短节拍推动信息与关系变化。' },
  arc: { label: '跨章套路', description: '从铺垫到升级、反转与收束；搭建可以跨多个章节发展的剧情线。' },
} as const;
export type TemplateScope = keyof typeof templateScopes;
type Role = { id: string; name: string; description: string };
type Beat = { title: string; content: string; participants: string[] };
export type PlotTemplate = {
  id: string;
  name: string;
  category: (typeof templateCategories)[number];
  scope: TemplateScope;
  description: string;
  roles: Role[];
  relationships: { source: string; target: string; label: string }[];
  beats: Beat[];
  twist: string;
};

// Original, reusable story scaffolds. {{roleId}} tokens are resolved before insertion.
const arcTemplates: PlotTemplate[] = [
  {
    id: 'borrowed-blade', name: '借刀杀人 · 三方设局', category: '多人博弈', scope: 'arc',
    description: '幕后人利用双方矛盾，把别人变成自己的刀；识破后，敌人可能成为盟友。',
    relationships: [
      { source: 'schemer', target: 'rival', label: '利用矛盾，伪证误导' },
      { source: 'rival', target: 'hero', label: '利益冲突，受骗报复' },
      { source: 'hero', target: 'rival', label: '后期：交换情报，暂时结盟' },
      { source: 'hero', target: 'schemer', label: '后期：识破获利链，反向设局' },
    ],
    roles: [
      { id: 'hero', name: '主角', description: '想保住自己的利益或保护重要的人；掌握一条尚未串联的线索。' },
      { id: 'rival', name: '对立者', description: '与主角存在真实矛盾，但这次冲突中的关键认知是错误的。' },
      { id: 'schemer', name: '幕后人', description: '希望双方两败俱伤，从中获得资源、地位或掩盖旧事。' },
    ],
    beats: [
      { title: '真实矛盾被发现', content: '{{hero}}与{{rival}}因【具体利益】发生矛盾。{{schemer}}发现双方最容易被激怒的软肋。\n待补：为什么双方不能直接谈判？', participants: ['hero', 'rival', 'schemer'] },
      { title: '伪造证据，嫁祸一方', content: '{{schemer}}制造【看似可信的证据】，让{{rival}}误以为{{hero}}已经先动手。\n待补：证据的可信来源，以及其中一处可验证的漏洞。', participants: ['schemer', 'rival'] },
      { title: '冲突升级，第三方获利', content: '{{rival}}对{{hero}}展开【具体报复】，{{hero}}被迫反击。{{schemer}}趁机取得【可见收益】。\n待补：冲突造成了什么不能轻易恢复的损失？', participants: ['rival', 'hero', 'schemer'] },
      { title: '交叉验证，识破布局', content: '{{hero}}发现证据漏洞，与{{rival}}交换各自掌握的信息。两人拼出{{schemer}}隐藏的获利链。\n待补：谁愿意先放下敌意？需要付出什么担保？', participants: ['hero', 'rival'] },
      { title: '反向设局，重新分配利益', content: '{{hero}}与{{rival}}假装继续争斗，诱使{{schemer}}暴露。解决幕后布局后，双方原有矛盾仍需要处理。\n待补：结盟的期限、剩余分歧，以及反击的代价。', participants: ['hero', 'rival', 'schemer'] },
    ],
    twist: '变体：幕后人也被更高一层的人利用；或对立者早已识破，却借机逼主角让步。不要让识破阴谋自动消除双方真实矛盾。',
  },
  {
    id: 'three-way-prize', name: '三方争夺 · 动态站队', category: '多人博弈', scope: 'arc',
    description: '三方争夺同一资源，各自掌握不同筹码；每次结盟都会改变力量平衡。',
    relationships: [
      { source: 'power', target: 'hero', label: '资源优势，压制竞争' },
      { source: 'hero', target: 'broker', label: '交换筹码，暂时结盟' },
      { source: 'power', target: 'broker', label: '让利拉拢，动摇联盟' },
      { source: 'broker', target: 'hero', label: '利益变化，重新议价' },
    ],
    roles: [
      { id: 'hero', name: '主角阵营', description: '需要争夺物解决迫在眉睫的问题；优势有限，但掌握关键使用方法。' },
      { id: 'power', name: '强势阵营', description: '拥有最多资源和武力，希望独占争夺物。' },
      { id: 'broker', name: '游离阵营', description: '掌握入口、情报或合法资格，寻求收益与生存空间。' },
    ],
    beats: [
      { title: '争夺物出现', content: '【资源／资格／秘密】出现，{{hero}}、{{power}}和{{broker}}因不同理由必须得到它。\n待补：各方失败的代价，以及争夺的时间限制。', participants: ['hero', 'power', 'broker'] },
      { title: '弱者结盟，对抗垄断', content: '{{hero}}与{{broker}}交换筹码，暂时制衡{{power}}。双方约定【分配条件】。\n待补：谁拥有履约能力，谁握有退出筹码？', participants: ['hero', 'broker', 'power'] },
      { title: '强者让利，联盟动摇', content: '{{power}}向{{broker}}提出更有吸引力的条件，并展示{{hero}}隐瞒的事实。\n待补：这条事实为什么足以改变选择？', participants: ['power', 'broker', 'hero'] },
      { title: '站队变化，筹码反转', content: '{{broker}}改变站队或抬高要价。{{hero}}发现争夺物的【隐藏限制】，重新获得不可替代的筹码。\n待补：反转线索此前如何出现？', participants: ['broker', 'hero'] },
      { title: '最后交易，形成新秩序', content: '三方以新的筹码展开最终交涉或决战。得到争夺物的人必须承担【附带责任】。\n待补：谁真正获利？谁保住底线？谁留下后续冲突？', participants: ['hero', 'power', 'broker'] },
    ],
    twist: '变体：争夺物可以拆分，但拆分会失效；或真正重要的不是物品，而是各方在争夺中暴露的秘密。',
  },
  {
    id: 'reluctant-alliance', name: '被迫结盟 · 各怀目的', category: '多人博弈', scope: 'arc',
    description: '互不信任的人面对共同威胁，合作中暴露私心，再决定是否承担彼此的代价。',
    relationships: [
      { source: 'hero', target: 'enemy', label: '旧怨未解，能力互补' },
      { source: 'third', target: 'hero', label: '协调合作，隐瞒诉求' },
      { source: 'enemy', target: 'third', label: '临时盟友，互相制约' },
      { source: 'enemy', target: 'hero', label: '后期：以行动重新选择信任' },
    ],
    roles: [
      { id: 'hero', name: '主角', description: '必须解决共同危机，但无法独立完成；有一条不能退让的底线。' },
      { id: 'enemy', name: '旧敌', description: '与主角有旧怨，拥有主角缺少的能力；另有私人目标。' },
      { id: 'third', name: '第三位伙伴', description: '能够协调双方，也有隐瞒的诉求；并非无条件的调停者。' },
    ],
    beats: [
      { title: '共同危机堵住退路', content: '【共同威胁】使{{hero}}、{{enemy}}与{{third}}都无法独善其身，三人的能力恰好互补。\n待补：为什么不能另找帮手或各自逃走？', participants: ['hero', 'enemy', 'third'] },
      { title: '约定分工与禁区', content: '三人谈定任务分工、成果分配和不得触碰的底线。{{hero}}与{{enemy}}相互留有制约。\n待补：用什么保证承诺？', participants: ['hero', 'enemy', 'third'] },
      { title: '私心暴露，合作受损', content: '{{enemy}}或{{third}}为了【私人目标】擅自改变计划，让其他人付出代价。\n待补：违规是否有可理解的理由？受害者为什么还要合作？', participants: ['enemy', 'third', 'hero'] },
      { title: '危机升级，选择救人或自保', content: '旧协议失效。{{hero}}必须决定是否救下曾违约的人，{{enemy}}也面临对等选择。\n待补：这次选择牺牲的具体利益。', participants: ['hero', 'enemy'] },
      { title: '共同完成，但关系分叉', content: '三人解决危机，并重新结算损失。有的人建立信任，有的人只是接受了继续合作的条件。\n待补：哪段旧怨被解开，哪段矛盾仍在？', participants: ['hero', 'enemy', 'third'] },
    ],
    twist: '变体：主角才是违约者；或众人最终完成任务，却因为价值观分歧各奔东西。信任需要行动与代价支撑。',
  },
  {
    id: 'hidden-traitor', name: '团队内鬼 · 信任崩塌', category: '多人博弈', scope: 'arc',
    description: '情报不断泄露，最可疑的人未必是内鬼；调查与信任重建同时推进。',
    relationships: [
      { source: 'traitor', target: 'suspect', label: '引导怀疑，转移视线' },
      { source: 'hero', target: 'suspect', label: '调查嫌疑，核实证据' },
      { source: 'ally', target: 'suspect', label: '信任担保，承担风险' },
      { source: 'hero', target: 'traitor', label: '后期：验证泄密，追究责任' },
    ],
    roles: [
      { id: 'hero', name: '调查者', description: '负责找出泄密者，同时必须维持团队行动。' },
      { id: 'suspect', name: '被怀疑者', description: '行为异常，确实隐瞒了事情，但未必是泄密者。' },
      { id: 'traitor', name: '真正内鬼', description: '有接触情报的正当身份；泄密出于利益、胁迫或另一种忠诚。' },
      { id: 'ally', name: '信任纽带', description: '支持某位嫌疑人；错误判断会迫使其承担损失。' },
    ],
    beats: [
      { title: '行动失败，确认内部泄密', content: '【只有团队知道的计划】被外部势力提前获知。{{hero}}确认泄露范围，{{traitor}}推动大家怀疑{{suspect}}。\n待补：泄密造成的具体损失和接触情报的人。', participants: ['hero', 'traitor', 'suspect'] },
      { title: '证据指向错误的人', content: '{{suspect}}的异常行为引发围攻，{{ally}}为其担保。{{hero}}发现部分证据过于方便。\n待补：异常行为背后的真实秘密。', participants: ['suspect', 'ally', 'hero'] },
      { title: '分发不同情报，验证泄露路径', content: '{{hero}}给不同成员提供带有差异的情报，通过敌方行动核对来源。{{traitor}}试图篡改验证结果。\n待补：调查者如何防止误伤，以及验证方法的漏洞。', participants: ['hero', 'traitor'] },
      { title: '内鬼身份与动机同时揭开', content: '{{traitor}}暴露，但其动机让团队难以简单处置。{{suspect}}的秘密也被公开。\n待补：内鬼曾付出过什么，伤害了谁，是否有补救空间？', participants: ['traitor', 'suspect', 'hero'] },
      { title: '处理背叛，重建合作规则', content: '{{hero}}与{{ally}}重新评估信任，团队决定如何处置{{traitor}}、补偿{{suspect}}并防止再次泄密。\n待补：信任恢复需要哪一次可验证的行动？', participants: ['hero', 'ally', 'traitor', 'suspect'] },
    ],
    twist: '变体：存在两条独立泄密路径；或内鬼在调查中选择停止背叛，仍须为既有损害负责。',
  },
  {
    id: 'manufactured-misunderstanding', name: '误会离间 · 双向求证', category: '情感关系', scope: 'arc',
    description: '第三人利用信息差切断信任，双方付出行动求证，最后重新定义关系。',
    relationships: [
      { source: 'first', target: 'second', label: '重视关系，但解释受阻' },
      { source: 'divider', target: 'second', label: '剪裁信息，诱导误解' },
      { source: 'second', target: 'first', label: '疏远或反击，信任受损' },
      { source: 'first', target: 'divider', label: '后期：交叉求证，识破离间' },
    ],
    roles: [
      { id: 'first', name: '关系中的甲', description: '重视这段关系，却有不能立即解释的顾虑。' },
      { id: 'second', name: '关系中的乙', description: '有自己的脆弱点，面对疑点时倾向保护自己。' },
      { id: 'divider', name: '离间者', description: '希望关系破裂以获得地位、感情、利益或掩盖事实。' },
    ],
    beats: [
      { title: '信任已有一处裂缝', content: '{{first}}与{{second}}因【未解决的小问题】产生隔阂。{{divider}}知道双方各自的顾虑。\n待补：关系的价值，以及此前已有的信任证据。', participants: ['first', 'second', 'divider'] },
      { title: '半真半假的信息制造误会', content: '{{divider}}截取事实、隐去条件，让{{second}}误解{{first}}的行动。\n待补：真事实是什么？被隐藏的条件是什么？', participants: ['divider', 'second', 'first'] },
      { title: '求证受阻，关系付出代价', content: '{{first}}尝试解释，但【具体阻碍】使说明无法被验证。{{second}}选择疏远或反击。\n待补：不能靠一句话解决的真实原因，以及双方造成的伤害。', participants: ['first', 'second'] },
      { title: '双方独立行动，证据交汇', content: '{{first}}与{{second}}各自追查，并在一件可验证的事情上发现矛盾，识破{{divider}}的剪裁。\n待补：哪一方先承担风险重新联系？', participants: ['first', 'second', 'divider'] },
      { title: '真相澄清，关系重新协商', content: '离间事实被澄清，但双方仍要为误会期间的行为负责。{{first}}与{{second}}选择修复、改变边界或分开。\n待补：道歉、补偿与新的沟通方式。', participants: ['first', 'second'] },
    ],
    twist: '变体：离间者说的事实全部为真，只是解释错误；真相揭开后也可以选择不复合。',
  },
  {
    id: 'identity-reveal', name: '身份揭露 · 关系重排', category: '情感关系', scope: 'arc',
    description: '一个人的隐藏身份改变众人的判断，旧关系中的情感与现实利益发生冲突。',
    relationships: [
      { source: 'hidden', target: 'close', label: '亲近信任，隐瞒身份' },
      { source: 'holder', target: 'hidden', label: '以秘密施压，要求交换' },
      { source: 'interest', target: 'hidden', label: '身份变化牵动现实利益' },
      { source: 'close', target: 'hidden', label: '后期：重看过去，协商关系' },
    ],
    roles: [
      { id: 'hidden', name: '身份隐藏者', description: '因为安全、承诺或羞耻隐藏身份；害怕公开后失去现有关系。' },
      { id: 'close', name: '亲近者', description: '在不知真相时建立信任；公开后需要重新判断过去的行为。' },
      { id: 'holder', name: '秘密持有者', description: '掌握身份线索，试图交换利益或决定公开时机。' },
      { id: 'interest', name: '利益关联者', description: '身份变化会直接影响其资源、地位或安全。' },
    ],
    beats: [
      { title: '隐藏身份影响日常选择', content: '{{hidden}}为守住身份做出异常选择，{{close}}注意到矛盾。{{interest}}的利益开始受到影响。\n待补：读者可以回看验证的早期线索。', participants: ['hidden', 'close', 'interest'] },
      { title: '秘密成为交易筹码', content: '{{holder}}以身份秘密要求{{hidden}}完成【具体交换】。{{hidden}}的妥协伤害了{{close}}。\n待补：公开身份的真实代价。', participants: ['holder', 'hidden', 'close'] },
      { title: '关键场合身份暴露', content: '在【无法轻易退场的场合】，身份被主动承认或意外揭开。{{interest}}立即提出新的利益要求。\n待补：谁提供了可信证据？各人如何行动而非只震惊？', participants: ['hidden', 'holder', 'interest', 'close'] },
      { title: '各自重看过去，重新站队', content: '{{close}}重新理解此前的选择，{{interest}}评估损益，{{holder}}也失去或改变筹码。\n待补：哪些行为获得解释，哪些伤害不能被身份洗掉？', participants: ['close', 'interest', 'holder'] },
      { title: '身份之后，用选择证明关系', content: '{{hidden}}公开承担身份责任，并在【具体行动】中决定自己站在哪一边。{{close}}据此决定关系的未来。\n待补：新的责任、边界与未解决的旧账。', participants: ['hidden', 'close', 'interest'] },
    ],
    twist: '变体：公开的身份只是真相的一部分；或隐藏者并不接受别人强加给这个身份的责任。',
  },
  {
    id: 'public-comeback', name: '公开反击 · 压制与兑现', category: '成长逆袭', scope: 'arc',
    description: '主角被公开否定，通过准备与可验证的成果反击，胜利带来新的责任和对手。',
    relationships: [
      { source: 'opponent', target: 'hero', label: '公开否定，限制机会' },
      { source: 'witness', target: 'hero', label: '验证成果，决定机会' },
      { source: 'hero', target: 'opponent', label: '以成果回应具体质疑' },
      { source: 'witness', target: 'opponent', label: '按约裁决，监督兑现' },
    ],
    roles: [
      { id: 'hero', name: '被压制的主角', description: '具备尚未被承认的能力，想拿回机会或尊严；能力存在明确限制。' },
      { id: 'opponent', name: '压制者', description: '有维护地位或利益的理由，掌控评价规则或资源。' },
      { id: 'witness', name: '关键见证者', description: '拥有裁决、传播或分配机会的权力；有自己的判断标准。' },
    ],
    beats: [
      { title: '公开否定，机会被夺', content: '{{opponent}}在{{witness}}面前质疑{{hero}}，并剥夺【具体机会】。\n待补：质疑中哪部分成立？主角为何必须在此处回应？', participants: ['opponent', 'hero', 'witness'] },
      { title: '限定赌约，建立判断标准', content: '{{hero}}争取一次证明自己的机会，双方约定期限、规则和失败代价，{{witness}}承诺按结果判断。\n待补：什么结果能够客观验证？', participants: ['hero', 'opponent', 'witness'] },
      { title: '准备受阻，能力付出代价', content: '{{hero}}准备时遭遇真实短板，{{opponent}}继续施压。主角必须舍弃【资源／关系／捷径】以守住底线。\n待补：成果来自哪些此前已经展示的能力？', participants: ['hero', 'opponent'] },
      { title: '当众兑现，证据压过偏见', content: '{{hero}}在约定场合拿出成果。{{witness}}验证关键证据，{{opponent}}最后的质疑被事实回应。\n待补：反击如何对应开端的具体否定？', participants: ['hero', 'witness', 'opponent'] },
      { title: '赢回机会，承担后续责任', content: '{{hero}}拿回机会，但新的地位意味着【更高要求】。{{opponent}}接受、转变或引来新的竞争者。\n待补：胜利解决了什么，又留下什么代价？', participants: ['hero', 'opponent', 'witness'] },
    ],
    twist: '变体：主角只赢回部分尊重；或见证者承认成果，却因自身利益拒绝完全兑现承诺。',
  },
  {
    id: 'trial-treasure', name: '夺宝试炼 · 竞争与取舍', category: '成长逆袭', scope: 'arc',
    description: '试炼把竞争者放在同一条路上，隐藏规则迫使角色在奖励与底线之间选择。',
    relationships: [
      { source: 'hero', target: 'companion', label: '互补合作，成果需分配' },
      { source: 'competitor', target: 'hero', label: '同一目标，手段相异' },
      { source: 'keeper', target: 'hero', label: '隐藏考验，观察取舍' },
      { source: 'keeper', target: 'competitor', label: '同场筛选，不同结算' },
    ],
    roles: [
      { id: 'hero', name: '主角', description: '需要奖励解决个人困境；尚有未成熟的能力或判断。' },
      { id: 'competitor', name: '竞争者', description: '与主角目标相同，但手段、底线或资源不同。' },
      { id: 'companion', name: '同行者', description: '为主角提供互补能力，也需要获得自己的回报。' },
      { id: 'keeper', name: '试炼掌控者', description: '制定表面规则与隐藏考验；希望筛选出某种人，而非单纯的赢家。' },
    ],
    beats: [
      { title: '进入试炼，接受表面规则', content: '{{hero}}与{{companion}}进入【试炼地点】，{{competitor}}占据优势。{{keeper}}公布奖励与限制。\n待补：每人的参赛理由与退出代价。', participants: ['hero', 'companion', 'competitor', 'keeper'] },
      { title: '首次争夺，暴露能力短板', content: '{{hero}}与{{competitor}}争夺【阶段资源】，{{companion}}的能力帮助渡过难关。\n待补：主角不能靠已有能力直接获胜的原因。', participants: ['hero', 'competitor', 'companion'] },
      { title: '隐藏规则出现，合作变成风险', content: '{{keeper}}设置的隐藏条件显现：照表面规则获胜可能伤害同伴，或使奖励失去价值。\n待补：提前埋下的规则线索，以及验证方法。', participants: ['keeper', 'hero', 'companion'] },
      { title: '奖励与底线，必须放弃一项', content: '{{hero}}在奖励与{{companion}}的利益之间做出选择。{{competitor}}选择另一条路，结果开始分化。\n待补：选择需要付出的实际成本，避免免费获得全部。', participants: ['hero', 'companion', 'competitor'] },
      { title: '试炼结算，成长落到行动', content: '{{keeper}}揭示考验意图。{{hero}}获得部分奖励、经验或新责任，但失去的东西不会自动归还。\n待补：新的能力怎样用于下一次更难的选择？', participants: ['keeper', 'hero', 'competitor', 'companion'] },
    ],
    twist: '变体：掌控者的考验本身不公，角色共同打破规则；或主角失败，却通过取舍获得后续剧情的关键盟友。',
  },
];

const additionalArcTemplates: PlotTemplate[] = [
  {
    id: 'rivals-become-allies', name: '宿敌转盟友 · 信任分期兑现', category: '情感关系', scope: 'arc',
    description: '真正的对手在数次交锋中理解彼此，经共同危机、兑现承诺与旧账清算后成为有边界的盟友。',
    roles: [
      { id: 'hero', name: '主角', description: '与旧敌争夺真实利益，需要重新判断合作是否值得。' },
      { id: 'rival', name: '旧敌', description: '有独立立场和不能轻易原谅的旧账；能力与主角互补。' },
      { id: 'threat', name: '共同威胁', description: '逼双方合作，但不能代替双方解决旧怨。' },
    ],
    relationships: [
      { source: 'hero', target: 'rival', label: '真实竞争，逐渐理解底线' },
      { source: 'threat', target: 'hero', label: '施压，制造共同危机' },
      { source: 'threat', target: 'rival', label: '威胁共同利益' },
      { source: 'rival', target: 'hero', label: '后期：有限合作，分次兑现信任' },
    ],
    beats: [
      { title: '交锋中看见对方底线', content: '{{hero}}与{{rival}}多次争夺【具体利益】，其中一次有人放弃了伤及无辜的捷径。\n待补：读者如何看到真实选择，而非听见口头自夸？', participants: ['hero', 'rival'] },
      { title: '共同危机，先签有限协议', content: '{{threat}}带来共同危机。{{hero}}与{{rival}}约定一次有限合作，不要求立刻原谅过去。\n待补：期限、担保与不可触碰的禁区。', participants: ['hero', 'rival', 'threat'] },
      { title: '小承诺兑现，旧怨再次刺痛', content: '一次合作成功让双方愿意增加信任，但【旧事后果】重新出现。\n待补：谁真正受过伤？伤害需要怎样的补偿？', participants: ['hero', 'rival'] },
      { title: '可以背弃时，选择承担代价', content: '{{rival}}或{{hero}}获得独占利益的机会，却为了已作出的承诺承担可见损失。\n待补：承诺为什么比眼前利益重要？', participants: ['hero', 'rival', 'threat'] },
      { title: '结盟有边界，旧账有处理', content: '双方共同解决{{threat}}的威胁，并约定长期合作条件。旧账得到部分清算，仍允许分歧存在。\n待补：哪项承诺继续约束他们，哪项分歧留给后续？', participants: ['hero', 'rival', 'threat'] },
    ],
    twist: '变体：对手成为盟友后仍会在另一件事上竞争；或一方兑现承诺，另一方暂时无法原谅。信任要分次积累。',
  },
  {
    id: 'favor-debt', name: '人情债 · 善意变成束缚', category: '多人博弈', scope: 'arc',
    description: '一次真实援助积成人情债，之后的请求逐渐越过底线，角色必须区分感恩、偿还与服从。',
    roles: [
      { id: 'debtor', name: '欠情者', description: '曾得到不可替代的帮助，想报恩，但有必须保护的人或原则。' },
      { id: 'benefactor', name: '施恩者', description: '援助曾经真实，后来希望把善意兑换成更多控制或利益。' },
      { id: 'affected', name: '受影响者', description: '会为两人的人情交易付出代价，需要表达自己的诉求。' },
    ],
    relationships: [
      { source: 'benefactor', target: 'debtor', label: '援助在先，逐步追加要求' },
      { source: 'debtor', target: 'benefactor', label: '感恩偿还，边界逐渐受压' },
      { source: 'debtor', target: 'affected', label: '偿债行为牵动第三人利益' },
    ],
    beats: [
      { title: '危难受助，留下可见恩情', content: '{{benefactor}}付出代价帮助{{debtor}}渡过【具体难关】。\n待补：恩情为什么无法用普通报酬立即结清？', participants: ['benefactor', 'debtor'] },
      { title: '合理请求，主动回报', content: '{{benefactor}}提出第一次合理请求，{{debtor}}主动兑现，双方默认人情关系可以继续。\n待补：如何衡量这一回报，而不是让恩情无限增值？', participants: ['benefactor', 'debtor'] },
      { title: '要求升级，第三人受损', content: '新请求开始伤害{{affected}}。{{debtor}}第一次意识到服从与报恩并非同一件事。\n待补：第三人付出的具体损失。', participants: ['benefactor', 'debtor', 'affected'] },
      { title: '恩情被重提，必须划出底线', content: '{{benefactor}}重提当年的帮助，{{debtor}}提出有限补偿，并拒绝【越界条件】。\n待补：拒绝会带来哪些现实惩罚？', participants: ['benefactor', 'debtor', 'affected'] },
      { title: '偿还与关系，分别结算', content: '{{debtor}}完成可承担的偿还，也补偿{{affected}}。双方关系可以重建、破裂或转为明码交易。\n待补：哪些旧恩得到承认，哪些要求被永久拒绝？', participants: ['benefactor', 'debtor', 'affected'] },
    ],
    twist: '变体：施恩者并非有意控制，而是错误估计了请求的代价；或欠情者借口划界，逃避本来应该承担的偿还。',
  },
];

export const plotTemplates: PlotTemplate[] = [...arcTemplates, ...additionalArcTemplates, ...chapterTemplates];

export function filterPlotTemplates(scope: TemplateScope, category = '全部', query = ''): PlotTemplate[] {
  const search = query.trim().toLowerCase();
  return plotTemplates.filter((template) => template.scope === scope && (category === '全部' || template.category === category) && `${template.name} ${template.description} ${template.category}`.toLowerCase().includes(search));
}

export function createTemplateBoard(template: PlotTemplate, names: Record<string, string> = {}): Board {
  const scope = templateScopes[template.scope];
  const isChapter = template.scope === 'chapter';
  const resolved = Object.fromEntries(template.roles.map((role) => [role.id, names[role.id]?.trim() || `${role.name}（待命名）`]));
  const fill = (text: string) => text.replace(/\{\{([\w-]+)\}\}/g, (_token, roleId: string) => {
    if (!resolved[roleId]) throw new Error(`模板引用了不存在的角色：${roleId}`);
    return resolved[roleId];
  });
  const nodes: Board['nodes'] = template.roles.map((role, index) => ({
    id: `role-${role.id}`, type: 'story', position: { x: 50, y: 100 + index * 260 },
    data: { kind: 'character', title: resolved[role.id], act: role.name, content: `${role.description}\n\n待补：真实姓名、背景、与其他人的旧关系，以及本段剧情中具体想得到什么。` },
  }));
  const edges: Board['edges'] = template.relationships.map((relation, index) => ({ id: `role-relation-${index}`, source: `role-${relation.source}`, target: `role-${relation.target}`, label: relation.label }));
  template.beats.forEach((beat, index) => {
    const id = `beat-${index}`;
    nodes.push({ id, type: 'story', position: { x: 400 + (index % 3) * 350, y: 100 + Math.floor(index / 3) * 320 }, data: { kind: 'plot', title: `${index + 1}. ${beat.title}`, act: `${scope.label} · ${template.category} · ${template.name} · 第 ${index + 1} ${isChapter ? '节拍' : '阶段'}`, content: fill(beat.content) } });
    if (index > 0) edges.push({ id: `sequence-${index}`, source: `beat-${index - 1}`, target: id, label: isChapter ? '引出下一节拍' : '推动下一阶段' });
    for (const roleId of beat.participants) edges.push({ id: `participates-${roleId}-${index}`, source: `role-${roleId}`, target: id, label: isChapter ? '参与节拍' : '参与事件' });
  });
  nodes.push({ id: 'template-guide', type: 'story', position: { x: 400, y: 100 + Math.max(template.roles.length * 260, Math.ceil(template.beats.length / 3) * 320) }, data: { kind: 'note', title: `${template.name} · 填写与变体`, act: `${scope.label} · 模板使用提示`, content: `作用范围：${scope.label}\n${scope.description}\n\n角色映射：\n${template.roles.map((role) => `${role.name} → ${resolved[role.id]}`).join('\n')}\n\n把【占位内容】改成具体事件，回答每张卡里的“待补”问题；${isChapter ? '将示例台词与动作改成角色自己的口吻和习惯，在同一场景内完成节拍。' : '按故事需要删改节点、关系和阶段。'}\n\n${template.twist}` } });
  return boardSchema.parse({ version: 1, title: template.name, premise: template.description, nodes, edges });
}
