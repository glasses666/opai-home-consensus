const axes = Object.freeze([
  'ornament', 'symmetry', 'warmth', 'visualWeight', 'saturation', 'openness',
  'naturalMaterials', 'craft', 'maintenance', 'budget', 'historicalFidelity',
]);

const sources = Object.freeze([
  ['denmark-design', 'public-institution', 'https://denmark.dk/innovation-and-design/design/'],
  ['ad-japandi', 'professional-media', 'https://www.architecturaldigest.com/story/japandi-style-101'],
  ['ad-minimalist', 'professional-media', 'https://www.architecturaldigest.com/story/minimalist-interior-design-101'],
  ['ad-contemporary', 'professional-media', 'https://www.architecturaldigest.com/story/contemporary-interior-design-101'],
  ['ad-midcentury', 'professional-media', 'https://www.architecturaldigest.com/story/midcentury-modern-decor-basics-that-every-beginner-should-know'],
  ['moma-bauhaus', 'museum', 'https://www.moma.org/collection/terms/bauhaus'],
  ['ad-industrial', 'professional-media', 'https://www.architecturaldigest.com/story/industrial-interior-design-101'],
  ['moma-brutalist', 'museum', 'https://www.moma.org/collection/terms/brutalist-architecture'],
  ['vogue-quiet-luxury', 'professional-media', 'https://www.vogue.com/article/quiet-luxury-interiors-trend'],
  ['vam-postmodern', 'museum', 'https://www.vam.ac.uk/articles/what-is-postmodernism'],
  ['vam-art-deco', 'museum', 'https://www.vam.ac.uk/articles/an-introduction-to-art-deco'],
  ['vam-art-nouveau', 'museum', 'https://www.vam.ac.uk/articles/art-nouveau-an-international-style'],
  ['met-neoclassicism', 'museum', 'https://www.metmuseum.org/essays/neoclassicism'],
  ['ad-traditional', 'professional-media', 'https://www.architecturaldigest.com/story/traditional-interior-design-101'],
  ['ad-french-country', 'professional-media', 'https://www.architecturaldigest.com/story/french-country-decor-101'],
  ['house-garden-english', 'professional-media', 'https://www.houseandgarden.co.uk/gallery/english-country-house-style'],
  ['ad-mediterranean', 'professional-media', 'https://www.architecturaldigest.com/story/mediterranean-interior-design-101'],
  ['nps-spanish-missions', 'public-institution', 'https://www.nps.gov/subjects/travelspanishmissions/architecture-and-preservation.htm'],
  ['homes-gardens-tuscan', 'professional-media', 'https://www.homesandgardens.com/interior-design/what-is-a-tuscan-house-style'],
  ['ad-maximalist', 'professional-media', 'https://www.architecturaldigest.com/story/maximalist-interior-design-101'],
  ['met-chinese-furniture', 'museum', 'https://www.metmuseum.org/art/collection/search/39493'],
  ['ad-coastal', 'professional-media', 'https://www.architecturaldigest.com/story/coastal-interior-design-101'],
  ['ad-farmhouse', 'professional-media', 'https://www.architecturaldigest.com/story/farmhouse-style-101'],
  ['house-beautiful-rustic', 'professional-media', 'https://www.housebeautiful.com/design-inspiration/a23937828/rustic-design-style/'],
  ['house-beautiful-bohemian', 'professional-media', 'https://www.housebeautiful.com/design-inspiration/a23748087/what-is-bohemian-design-style/'],
  ['met-moroccan-court', 'museum', 'https://www.metmuseum.org/about-the-met/collection-areas/islamic-art/the-moroccan-court'],
  ['archdaily-tropical', 'professional-media', 'https://www.archdaily.com/tag/tropical-architecture'],
  ['unesco-feng-shui', 'public-institution', 'https://whc.unesco.org/en/list/1113'],
  ['feng-shui-review', 'academic-review', 'https://www.sciencedirect.com/science/article/pii/S2405844023067403'],
].map(([id, kind, url]) => Object.freeze({ id, kind, url })));

function style(id, zh, en, family, reception, sourceIds, profile, characteristics) {
  return Object.freeze({
    id, names: { zh, en }, family, reception, sourceIds,
    evidence: 'source_facts_plus_curated_translation',
    profile: Object.freeze({ source: 'curated_estimate', scale: '0..5', ...Object.fromEntries(axes.map((axis, i) => [axis, profile[i]])) }),
    characteristics: Object.freeze(characteristics),
  });
}

const styles = Object.freeze([
  style('scandinavian', '北欧风', 'Scandinavian', 'modern', 'broad', ['denmark-design'], [1,2,4,1,1,4,5,3,2,3,2], {
    layout: '通透、功能优先、减少视觉阻挡', palette: ['暖白','浅灰','浅木'], materials: ['白橡木','羊毛','亚麻','玻璃'], envelope: ['浅色墙顶','浅木地面'], furniture: ['轻体量','清晰线条','人体工学'], lighting: ['自然光','漫射暖光'], methods: ['隐藏收纳','少量耐用单品'], avoid: ['只有白色而无纹理','深色重家具堆叠'],
  }),
  style('japandi', '日式北欧', 'Japandi', 'modern', 'broad', ['ad-japandi'], [1,2,5,2,1,4,5,4,2,4,2], {
    layout: '留白、低矮、重视室内外联系', palette: ['米灰','土褐','墨色点缀'], materials: ['木','石','纸','棉麻','藤'], envelope: ['石灰洗墙','哑光木地面'], furniture: ['低矮','有机轮廓','手工感'], lighting: ['自然光','低眩光'], methods: ['减少物件','保留材料不完美'], avoid: ['高亮表面','无目的装饰'],
  }),
  style('minimalist', '极简主义', 'Minimalist', 'modern', 'broad', ['ad-minimalist'], [0,3,2,1,0,5,3,4,2,4,1], {
    layout: '开放、清晰、每件物品有用途', palette: ['单色','低饱和中性'], materials: ['木','石','玻璃','哑光金属'], envelope: ['连续墙面','收口隐藏'], furniture: ['数量少','比例精准'], lighting: ['线性或洗墙','避免灯具噪声'], methods: ['无拉手柜门','整合设备'], avoid: ['为了空而牺牲收纳','廉价收口'],
  }),
  style('contemporary', '当代风', 'Contemporary', 'modern', 'trend-sensitive', ['ad-contemporary'], [2,2,3,2,2,4,3,3,2,3,0], {
    layout: '随当代生活方式调整的开放或混合格局', palette: ['中性色基底','一处强调色'], materials: ['木','石','金属','织物混合'], envelope: ['干净基底','局部焦点墙'], furniture: ['现代轮廓','少量艺术单品'], lighting: ['建筑光与装饰灯并用'], methods: ['克制混搭','关注当期材料'], avoid: ['把短期趋势铺满全屋'],
  }),
  style('mid-century-modern', '中世纪现代', 'Mid-century modern', 'modern', 'broad', ['ad-midcentury'], [2,2,4,2,3,4,4,3,3,4,4], {
    layout: '开阔视线、室内外联系', palette: ['胡桃木色','芥末黄','橄榄绿','砖红'], materials: ['柚木','胡桃木','皮革','玻璃'], envelope: ['木地板','大窗'], furniture: ['低矮','锥形腿','几何曲线'], lighting: ['球形或雕塑灯具'], methods: ['复古单品与现代壳体搭配'], avoid: ['全套复刻成主题空间'],
  }),
  style('bauhaus', '包豪斯', 'Bauhaus', 'modern', 'niche', ['moma-bauhaus'], [0,3,2,2,4,4,1,3,2,3,5], {
    layout: '理性、功能分区明确', palette: ['白黑灰','红黄蓝点缀'], materials: ['管状钢','玻璃','皮革'], envelope: ['平整无装饰表面'], furniture: ['几何','可工业生产','结构可读'], lighting: ['功能性几何灯具'], methods: ['形式服从功能','暴露合理构造'], avoid: ['只复制三原色符号'],
  }),
  style('industrial', '工业风', 'Industrial', 'modern', 'polarizing', ['ad-industrial'], [1,1,2,4,1,5,2,2,4,3,3], {
    layout: '开放、保留结构与服务系统', palette: ['炭灰','锈色','深木'], materials: ['混凝土','砖','钢','旧木','皮革'], envelope: ['裸露结构','粗纹理地面'], furniture: ['耐用大体量','金属木混合'], lighting: ['轨道灯','工厂型吊灯'], methods: ['旧构件再用','木与织物回温'], avoid: ['采光差小空间全灰化'],
  }),
  style('brutalist', '粗野主义', 'Brutalist', 'modern', 'polarizing', ['moma-brutalist'], [0,2,1,5,0,4,2,3,4,4,4], {
    layout: '强调体块、结构和阴影', palette: ['混凝土灰','石色','黑'], materials: ['清水混凝土','粗石','钢','厚木'], envelope: ['大连续质感面'], furniture: ['厚重几何','雕塑体块'], lighting: ['侧光','窄角强调材质'], methods: ['局部材料真实表达'], avoid: ['低层高小空间照搬纪念性体量'],
  }),
  style('quiet-luxury', '静奢', 'Quiet luxury', 'luxury', 'trend-sensitive', ['vogue-quiet-luxury'], [1,3,5,2,1,4,5,5,4,5,1], {
    layout: '比例稳定、物件少而精', palette: ['奶油','燕麦','灰褐'], materials: ['天然石','实木','羊毛','亚麻','哑光金属'], envelope: ['细腻墙面','连续木作'], furniture: ['低调定制','无明显品牌符号'], lighting: ['分层暖光','低眩光'], methods: ['对缝对线','统一留缝','高质量五金'], avoid: ['仅靠米色冒充高级','廉价贴皮与粗糙收口'],
  }),
  style('memphis-postmodern', '孟菲斯后现代', 'Memphis / Postmodern', 'expressive', 'polarizing', ['vam-postmodern'], [5,1,2,3,5,2,0,3,3,3,5], {
    layout: '非对称、强调舞台与焦点', palette: ['高纯度粉蓝黄','黑白图形'], materials: ['层压板','彩色金属','塑料','图案织物'], envelope: ['几何图案墙地'], furniture: ['异形','图形化','反常规比例'], lighting: ['彩色与雕塑灯具'], methods: ['局部强表达','重复一组图形语言'], avoid: ['每个面都争夺注意力'],
  }),
  style('art-deco', '装饰艺术', 'Art Deco', 'historic', 'broad', ['vam-art-deco'], [5,5,3,4,4,2,2,5,5,5,5], {
    layout: '强轴线、对称、序列感', palette: ['黑金','祖母绿','奶油','宝石色'], materials: ['黄铜','漆面','镜面','大理石','深木'], envelope: ['阶梯线脚','几何镶嵌'], furniture: ['流线与几何并用'], lighting: ['对称壁灯','雕塑吊灯'], methods: ['金属收边','放射纹','精细镶嵌'], avoid: ['高光与金色无层次堆叠'],
  }),
  style('art-nouveau', '新艺术', 'Art Nouveau', 'historic', 'niche', ['vam-art-nouveau'], [5,1,4,3,3,2,5,5,5,5,5], {
    layout: '结构与装饰一体、有机不对称', palette: ['植物绿','琥珀','柔和宝石色'], materials: ['曲木','锻铁','彩绘玻璃','陶瓷'], envelope: ['藤蔓线条','植物纹壁面'], furniture: ['曲线','手工雕饰'], lighting: ['彩玻璃与植物形灯'], methods: ['整体艺术设计','定制曲线构件'], avoid: ['廉价印花模拟手工'],
  }),
  style('neoclassical', '新古典主义', 'Neoclassical', 'historic', 'broad', ['met-neoclassicism'], [4,5,3,4,2,2,2,5,4,5,5], {
    layout: '中轴、对称、比例秩序', palette: ['象牙白','浅灰','浅蓝','少量金'], materials: ['石膏','大理石','深浅木'], envelope: ['柱式','壁柱','檐口','护墙板'], furniture: ['正式端正','古典轮廓'], lighting: ['中心吊灯','成对壁灯'], methods: ['精确线脚与模数'], avoid: ['小尺度空间使用过重柱式'],
  }),
  style('traditional-european', '传统欧陆', 'Traditional European', 'historic', 'broad', ['ad-traditional'], [4,5,4,4,3,2,4,5,5,5,4], {
    layout: '正式房间序列与对称', palette: ['暖中性','深木','暗红绿蓝'], materials: ['实木','羊毛','亚麻','天鹅绒','黄铜'], envelope: ['线脚','壁炉','木地板'], furniture: ['古董或古典轮廓'], lighting: ['吊灯、台灯、壁灯分层'], methods: ['织物层叠','新旧混合'], avoid: ['全部家具同套同色'],
  }),
  style('french-provincial', '法式乡村', 'French Provincial', 'historic', 'broad', ['ad-french-country'], [4,3,5,3,2,3,5,5,5,4,4], {
    layout: '松弛乡村骨架加精致焦点', palette: ['奶油','浅黄','浅蓝','鼠尾草绿'], materials: ['旧木','石','亚麻','棉'], envelope: ['木梁','石地或旧木地'], furniture: ['弧线','cabriole腿','做旧柜'], lighting: ['枝形吊灯','布罩壁灯'], methods: ['刷漆木作','toile与小花纹'], avoid: ['过度甜美或假做旧'],
  }),
  style('english-country', '英式乡村', 'English Country', 'historic', 'broad', ['house-garden-english'], [5,2,5,4,4,2,5,4,5,4,4], {
    layout: '围绕壁炉、阅读与交谈形成舒适角落', palette: ['暖黄','苔绿','暗红','多色层叠'], materials: ['旧木','羊毛','棉麻','陶瓷'], envelope: ['壁纸','木地板','地毯'], furniture: ['大沙发','古董混搭','书柜'], lighting: ['布罩台灯为主'], methods: ['花纹、条纹、格纹有秩序混搭'], avoid: ['没有收纳计划的摆件堆积'],
  }),
  style('mediterranean', '地中海风', 'Mediterranean', 'regional', 'broad', ['ad-mediterranean'], [3,2,5,3,4,5,5,4,4,4,4], {
    layout: '室内外连通、拱形开口、空气流动', palette: ['白','陶土','海蓝','橄榄绿'], materials: ['灰泥','陶砖','石','铁艺','木'], envelope: ['白色抹灰墙','陶土地面','露梁'], furniture: ['粗粝木作','编织'], lighting: ['日光','铁艺灯具'], methods: ['手工瓷砖','厚质感抹灰'], avoid: ['海洋主题道具化'],
  }),
  style('spanish-colonial', '西班牙殖民', 'Spanish Colonial', 'regional', 'niche', ['nps-spanish-missions'], [4,3,5,5,3,3,5,5,5,5,5], {
    layout: '厚墙、庭院、拱门和回廊感', palette: ['砂色','陶红','深木'], materials: ['抹灰','陶砖','深木','铁艺'], envelope: ['圆拱','木梁','手工砖'], furniture: ['厚实木作','雕花门柜'], lighting: ['锻铁吊灯','深阴影'], methods: ['传统抹灰','手工铁件'], avoid: ['冷灰铬色与轻薄板式家具'],
  }),
  style('tuscan', '托斯卡纳', 'Tuscan', 'regional', 'polarizing', ['homes-gardens-tuscan'], [4,3,5,5,3,2,5,4,5,5,4], {
    layout: '围绕餐厨、壁炉和乡野聚会', palette: ['赭石','蜂蜜木','橄榄绿','砖红'], materials: ['石','灰泥','陶砖','木梁','铁艺'], envelope: ['粗纹理墙','拱券','cotto地面'], furniture: ['厚实木桌柜'], lighting: ['温暖低位光'], methods: ['材料做旧但保留真实质感'], avoid: ['满屋褐黄和仿古贴皮'],
  }),
  style('victorian-maximalist', '维多利亚极繁', 'Victorian Maximalist', 'historic', 'polarizing', ['ad-maximalist'], [5,3,4,5,5,1,3,5,5,5,4], {
    layout: '房间分明、焦点密集但有层次', palette: ['宝石色','深红绿蓝','金'], materials: ['深木','天鹅绒','黄铜','彩玻璃'], envelope: ['繁复线脚','壁纸','厚窗帘'], furniture: ['古董与收藏型家具'], lighting: ['多盏装饰灯'], methods: ['图案与艺术品层叠'], avoid: ['没有重复色或主次的无序堆满'],
  }),
  style('wabi-sabi', '侘寂', 'Wabi-sabi', 'asian', 'niche', ['ad-japandi'], [1,1,5,2,1,4,5,5,3,4,4], {
    layout: '留白、顺应材料与时间痕迹', palette: ['泥土色','灰褐','炭色'], materials: ['旧木','手工陶','粗石','亚麻'], envelope: ['不均匀抹灰','自然纹理地面'], furniture: ['低矮','不完美手作'], lighting: ['柔和侧光'], methods: ['修补而非掩盖','克制陈设'], avoid: ['把破旧和施工缺陷包装成侘寂'],
  }),
  style('new-chinese', '新中式', 'New Chinese', 'asian', 'broad', ['met-chinese-furniture'], [3,4,5,3,3,3,5,5,4,5,4], {
    layout: '轴线、框景、虚实分区', palette: ['木色','墨色','米白','低饱和红绿'], materials: ['硬木','石','纸','丝织物','黄铜'], envelope: ['木格栅','留白墙面','石木地面'], furniture: ['明式比例的现代简化'], lighting: ['灯笼或纸质漫射光'], methods: ['榫卯语言','书画陶瓷点景'], avoid: ['符号贴满或厚重红木成套'],
  }),
  style('coastal', '海岸风', 'Coastal', 'regional', 'broad', ['ad-coastal'], [1,2,4,1,2,5,5,2,3,3,1], {
    layout: '开放、轻盈、强调窗景和通风', palette: ['白','沙色','雾蓝'], materials: ['浅木','亚麻','黄麻','藤'], envelope: ['白墙','浅木或浅石地面'], furniture: ['轻体量','可放松使用'], lighting: ['自然光','玻璃与编织灯'], methods: ['自然纹理叠加'], avoid: ['锚、船舵等主题道具过量'],
  }),
  style('farmhouse', '农舍风', 'Farmhouse', 'regional', 'broad', ['ad-farmhouse'], [3,3,5,3,2,4,5,3,4,3,3], {
    layout: '务实动线、围绕大餐桌与家庭活动', palette: ['奶油','灰白','旧木'], materials: ['旧木','砖','棉麻','铁'], envelope: ['木板墙或简单抹灰','耐用地面'], furniture: ['舒适','可维护','新旧混搭'], lighting: ['简单吊灯与壁灯'], methods: ['开放收纳','再生材料'], avoid: ['把标语和乡村道具当设计'],
  }),
  style('rustic', '原木粗犷', 'Rustic', 'regional', 'niche', ['house-beautiful-rustic'], [2,1,5,5,2,3,5,3,5,3,3], {
    layout: '突出材料与火炉等核心场所', palette: ['土色','木色','石灰色'], materials: ['未抛光木','石','麻布','帆布'], envelope: ['粗石墙','裸木梁','哑光地面'], furniture: ['厚实耐用','粗加工边缘'], lighting: ['暖光与火光感'], methods: ['保留节疤、锯痕与自然边'], avoid: ['塑料贴皮模拟天然材料'],
  }),
  style('bohemian-eclectic', '波西米亚折衷', 'Bohemian Eclectic', 'expressive', 'polarizing', ['house-beautiful-bohemian'], [5,1,5,3,5,3,5,4,5,3,1], {
    layout: '围绕收藏、交谈和放松自由组合', palette: ['浓郁土色','宝石色','多色纹样'], materials: ['藤','木','羊毛','棉','手工陶'], envelope: ['图案地毯','艺术墙'], furniture: ['复古与旅行收藏混搭'], lighting: ['串灯、台灯、编织灯层叠'], methods: ['用重复色和材质收住混搭'], avoid: ['所有物件同时抢焦点'],
  }),
  style('moroccan', '摩洛哥风', 'Moroccan', 'regional', 'niche', ['met-moroccan-court'], [5,4,5,4,5,3,5,5,5,5,5], {
    layout: '围合、庭院、拱廊与低座交谈区', palette: ['钴蓝','绿','赭红','白'], materials: ['zellige瓷砖','雕花灰泥','雪松','黄铜'], envelope: ['几何拼花','马蹄拱','雕刻墙面'], furniture: ['低座','木与皮革'], lighting: ['穿孔金属灯影'], methods: ['手工拼砖与雕刻'], avoid: ['用印刷贴纸替代真实工艺'],
  }),
  style('balinese-tropical', '巴厘热带', 'Balinese Tropical', 'regional', 'niche', ['archdaily-tropical'], [3,2,5,3,3,5,5,4,5,4,2], {
    layout: '跨通风、深檐、庭院与半室外过渡', palette: ['木色','石色','植物绿'], materials: ['柚木','竹','藤','火山石','亚麻'], envelope: ['自然石地面','木格栅','大开口'], furniture: ['低矮编织','室内外兼用'], lighting: ['过滤日光','低色温灯'], methods: ['遮阳、通风、耐湿材料'], avoid: ['在寒冷干燥气候无条件复制开放边界'],
  }),
]);

const fengShuiOverlay = Object.freeze({
  id: 'feng-shui-residential-basic',
  kind: 'cultural_overlay',
  defaultEnabled: false,
  notBuildingCode: true,
  effectClaim: 'none',
  sourceIds: ['unesco-feng-shui', 'feng-shui-review'],
  instruction: '只有住户明确选择后才询问和记录；不得覆盖结构、安全、消防、机电、人体工学或企业规则。',
  considerations: Object.freeze([
    { topic: 'entry', prompt: '是否在意入户视线、遮挡、秩序或迎宾仪式感？' },
    { topic: 'bed', prompt: '是否在意床与门窗、镜面和主要通道的相对关系？' },
    { topic: 'stove', prompt: '是否在意灶、水槽、门窗和厨房动线的相对关系？' },
    { topic: 'mirror', prompt: '是否在意镜面反射床、入口、灶或主要活动区？' },
    { topic: 'circulation', prompt: '是否希望主要动线更迂回、私密或具有空间层次？' },
  ]),
});

export const designStyleCorpus = Object.freeze({
  id: 'design-style-corpus-v1',
  version: 1,
  disclaimer: '风格特征用于需求澄清和方案方向，不是法规、施工标准、欧派产品数据或效果保证。',
  axes,
  sources,
  styles,
  overlays: Object.freeze([fengShuiOverlay]),
});

export function validateDesignStyleCorpus(corpus = designStyleCorpus) {
  const errors = [];
  const sourceIds = new Set(corpus.sources.map((source) => source.id));
  const styleIds = new Set();
  for (const [index, item] of corpus.styles.entries()) {
    if (!item.id || styleIds.has(item.id)) errors.push(`styles[${index}].id`);
    styleIds.add(item.id);
    if (!item.names?.zh || !item.names?.en || !item.family || !item.reception) errors.push(`styles[${index}].identity`);
    if (!item.sourceIds?.length || item.sourceIds.some((id) => !sourceIds.has(id))) errors.push(`styles[${index}].sourceIds`);
    if (item.profile?.source !== 'curated_estimate' || corpus.axes.some((axis) => !Number.isInteger(item.profile?.[axis]) || item.profile[axis] < 0 || item.profile[axis] > 5)) errors.push(`styles[${index}].profile`);
    if (['layout','palette','materials','envelope','furniture','lighting','methods','avoid'].some((key) => !item.characteristics?.[key]?.length)) errors.push(`styles[${index}].characteristics`);
  }
  for (const [index, overlay] of corpus.overlays.entries()) {
    if (overlay.kind !== 'cultural_overlay' || overlay.defaultEnabled !== false || overlay.notBuildingCode !== true || overlay.effectClaim !== 'none') errors.push(`overlays[${index}].boundary`);
    if (overlay.sourceIds.some((id) => !sourceIds.has(id))) errors.push(`overlays[${index}].sourceIds`);
  }
  return { ok: errors.length === 0, errors };
}
