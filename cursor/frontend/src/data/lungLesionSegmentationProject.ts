import type { AnalysisStepTask } from '../types/analysisTask'
import type {
  CodeBlock,
  ExecutionStep,
  FollowUpQuestion,
  LogicPlanItem,
  TermDefinition,
} from '../types'
import type { PresetProject } from './mnistDigitProject'

export const LUNG_LESION_PROJECT_ID = 'lung-lesion-seg'

const logicPlan: LogicPlanItem[] = [
  {
    id: 1,
    title: '项目目标',
    content:
      '构建一个肺部病灶分割系统：输入胸部 CT 二维切片（单通道灰度），输出与输入同尺寸的像素级病灶掩膜（0=背景，1=病灶）。' +
      '适合作为医学影像语义分割入门项目，从数据加载到 Dice 评估走通完整流程。',
  },
  {
    id: 2,
    title: '任务类型',
    content:
      '属于语义分割（Semantic Segmentation）：为每个像素分配类别标签。采用监督学习，需要带像素级标注掩膜的训练集与独立验证集评估泛化能力。',
  },
  {
    id: 3,
    title: '数据方案',
    content:
      '使用公开肺部 CT 切片数据集（如 LUNA16 子集或等价的本地标注数据）：训练/验证划分，每张切片配合同尺寸二值掩膜。' +
      '需统一分辨率（如 512×512）、窗宽窗位预处理，并检查掩膜与影像对齐。',
  },
  {
    id: 4,
    title: '模型选择',
    content:
      '选用 U-Net 编码器–解码器结构：通过跳跃连接融合低层细节与高层语义，适合小样本医学分割。' +
      '损失函数采用 Dice Loss 或 BCE + Dice 组合，优化病灶区域重叠度。',
  },
  {
    id: 5,
    title: '评估指标',
    content:
      '主要指标为 Dice 系数与 IoU（交并比）；可辅以灵敏度、特异度观察漏检与误检。' +
      '目标 Dice 通常可达 0.75 以上（视数据质量与病灶大小而定）。',
  },
  {
    id: 6,
    title: '模块划分',
    content:
      '拆为五个代码模块：config（超参与路径）→ load_data（加载影像与掩膜）→ preprocess（窗宽窗位与归一化）→ ' +
      'train_unet（训练分割网络）→ evaluate（验证集推理与 Dice/IoU 报告）。',
  },
]

const executionSteps: ExecutionStep[] = [
  {
    step_id: 1,
    title: '搭建开发环境',
    logic_plan_ref: 2,
    description: '为肺部病灶分割项目准备 Python 深度学习环境',
    sub_steps: [
      {
        sub_id: 1,
        title: '安装 Python 与 PyTorch',
        rationale: '医学影像分割依赖深度学习框架，PyTorch 生态便于实现 U-Net',
        description:
          '确认 Python 3.9+；创建虚拟环境后安装 torch、torchvision 及 numpy、opencv-python、scikit-learn。',
        why: 'U-Net 训练与 GPU 加速依赖 PyTorch；OpenCV 用于影像读写与预处理。',
        inputs: '可联网计算机（可选 NVIDIA GPU）',
        outputs: '可 import torch 的虚拟环境',
        knowledge_points: ['Python', 'PyTorch', '虚拟环境'],
        code_module: '',
        common_errors: ['CUDA 版本与 torch 不匹配', '未激活虚拟环境'],
        next_hint: '运行 torch.cuda.is_available() 确认 GPU 状态',
      },
      {
        sub_id: 2,
        title: '准备项目目录结构',
        rationale: '分割任务涉及影像、掩膜、模型权重等多类文件，需规范目录',
        description:
          '创建 data/images、data/masks、checkpoints、outputs 等目录；在 config 中统一配置路径。',
        why: '清晰目录避免训练时找错标注文件或覆盖权重。',
        inputs: '项目根目录',
        outputs: '目录结构与 config 路径常量',
        knowledge_points: ['项目结构', '配置管理'],
        code_module: 'config.py',
        common_errors: ['掩膜与影像分目录但未按同名配对', '相对路径写死'],
        next_hint: '确认一张影像能对应找到同名掩膜',
      },
    ],
  },
  {
    step_id: 2,
    title: '获取与检查数据',
    logic_plan_ref: 3,
    description: '加载带标注的肺部 CT 切片及病灶掩膜',
    sub_steps: [
      {
        sub_id: 1,
        title: '加载影像–掩膜对',
        rationale: '语义分割监督信号来自像素级掩膜，必须成对加载',
        description:
          '按文件名配对读取 CT 切片与二值掩膜；校验尺寸一致、掩膜取值仅为 0/1。',
        why: '尺寸不一致或掩膜未对齐会导致训练标签错误。',
        inputs: 'data/images 与 data/masks',
        outputs: '训练集与验证集的 (image, mask) 列表或 Dataset',
        knowledge_points: ['语义分割标注', 'Dataset'],
        code_module: 'load_data.py',
        common_errors: ['影像与掩膜文件名不对应', '掩膜非二值'],
        next_hint: '随机可视化一对影像–掩膜叠加图',
      },
      {
        sub_id: 2,
        title: '划分训练集与验证集',
        rationale: '需在未见数据上评估分割泛化，避免过拟合某几例切片',
        description:
          '按病例或切片 ID 划分 train/val（如 8:2）；记录划分清单，保证同一病例不跨集泄漏。',
        why: '随机按切片划分可能使同一患者切片同时出现在训练与验证，分数虚高。',
        inputs: '全部配对样本',
        outputs: 'train/val 索引或路径列表',
        knowledge_points: ['数据划分', '数据泄漏'],
        code_module: 'load_data.py',
        common_errors: ['同一患者切片跨集', '验证集过小'],
        next_hint: '记录 train/val 样本数量',
      },
    ],
  },
  {
    step_id: 3,
    title: '预处理、训练与评估',
    logic_plan_ref: 4,
    description: '窗宽窗位预处理、训练 U-Net 并在验证集上评估 Dice',
    sub_steps: [
      {
        sub_id: 1,
        title: '窗宽窗位与归一化',
        rationale: 'CT  Hounsfield 值范围大，需截断与缩放至网络输入范围',
        description:
          '应用肺窗（如 -1000~400 HU）截断，线性映射到 [0,1]；可选 resize 至固定尺寸（512×512）。',
        why: '统一数值范围有利于网络收敛；肺窗突出肺实质与结节对比。',
        inputs: '原始 CT 切片数组',
        outputs: '归一化后的 float32 张量',
        knowledge_points: ['窗宽窗位', 'HU 值', '归一化'],
        code_module: 'preprocess.py',
        common_errors: ['未截断导致极值主导', '掩膜未同步 resize'],
        next_hint: '对比预处理前后直方图',
      },
      {
        sub_id: 2,
        title: '训练 U-Net 并计算 Dice',
        rationale: '完成分割模型训练并在验证集量化病灶重叠程度',
        description:
          '构建 U-Net，以 Dice Loss 训练若干 epoch；在验证集推理，报告平均 Dice 与 IoU。',
        why: 'Dice 直接反映病灶区域预测与标注的重叠，是分割任务常用指标。',
        inputs: '预处理后的 train/val 数据',
        outputs: '模型权重与验证集 Dice/IoU 报告',
        knowledge_points: ['U-Net', 'Dice 系数', 'IoU'],
        code_module: 'train_unet.py',
        common_errors: ['仅看训练 loss 不看验证 Dice', 'batch 中掩膜维度错误'],
        next_hint: '保存最佳验证 Dice 对应 checkpoint',
      },
    ],
  },
]

const codeBlocks: CodeBlock[] = [
  {
    file_name: 'config.py',
    language: 'python',
    code: `# 肺部病灶分割 — 项目配置
PROJECT_NAME = "lung_lesion_unet"
IMAGE_SIZE = (512, 512)
BATCH_SIZE = 4
EPOCHS = 30
LEARNING_RATE = 1e-4
DATA_ROOT = "./data"
CHECKPOINT_DIR = "./checkpoints"
`,
    annotations: [
      { line: '2', text: '统一输入尺寸，便于 batch 训练。' },
      { line: '6', text: '学习率与 epoch 可在实验中调整。' },
    ],
  },
  {
    file_name: 'load_data.py',
    language: 'python',
    code: `from pathlib import Path
import cv2
import numpy as np

def load_pairs(image_dir, mask_dir):
    """按同名文件加载 (image, mask) 对，返回列表。"""
    pairs = []
    for img_path in sorted(Path(image_dir).glob("*.png")):
        mask_path = Path(mask_dir) / img_path.name
        if not mask_path.exists():
            continue
        img = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        pairs.append((img, (mask > 127).astype(np.uint8)))
    return pairs
`,
    annotations: [
      { line: '5', text: '影像与掩膜同名配对，掩膜二值化为 0/1。' },
    ],
  },
  {
    file_name: 'preprocess.py',
    language: 'python',
    code: `import numpy as np

def lung_window(arr, low=-1000, high=400):
    """肺窗截断并归一化到 [0, 1]。"""
    arr = np.clip(arr, low, high)
    return (arr - low) / (high - low)
`,
    annotations: [
      { line: '4', text: 'CT 常用肺窗突出肺野与结节。' },
    ],
  },
  {
    file_name: 'train_unet.py',
    language: 'python',
    code: `import torch
import torch.nn as nn

class DoubleConv(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1),
            nn.ReLU(inplace=True),
        )
    def forward(self, x):
        return self.net(x)

# U-Net 主体略；训练循环中使用 Dice Loss
`,
    annotations: [
      { line: '3', text: 'U-Net 由编码、解码与跳跃连接组成，此处展示基础卷积块。' },
    ],
  },
  {
    file_name: 'evaluate.py',
    language: 'python',
    code: `import numpy as np

def dice_coef(y_true, y_pred, eps=1e-6):
    inter = (y_true * y_pred).sum()
    return (2 * inter + eps) / (y_true.sum() + y_pred.sum() + eps)

def iou_score(y_true, y_pred, eps=1e-6):
    inter = (y_true * y_pred).sum()
    union = y_true.sum() + y_pred.sum() - inter
    return (inter + eps) / (union + eps)
`,
    annotations: [
      { line: '3', text: 'Dice 衡量预测掩膜与标注的重叠，分割任务核心指标。' },
    ],
  },
]

const terms: TermDefinition[] = [
  { term: '语义分割', definition: '为图像每个像素分配类别，区分病灶与背景。' },
  { term: 'U-Net', definition: '编码–解码网络，跳跃连接保留边界细节，常用于医学分割。' },
  { term: 'Dice 系数', definition: '预测与标注区域的重叠度量，越接近 1 越好。' },
  { term: 'IoU', definition: '交并比，预测与标注的交集除以并集。' },
  { term: '窗宽窗位', definition: 'CT 显示设置，突出肺野与软组织对比。' },
]

const analysisTasks: AnalysisStepTask[] = [
  {
    title: '明确项目目标',
    summary:
      '从问题定义角度梳理肺部病灶分割系统边界：输入为胸部 CT 二维切片（单通道），输出为同尺寸二值掩膜（背景/病灶）；' +
      '界定系统职责为推理阶段的分割预测，不含数据采集、标注工具开发与临床部署；' +
      '以验证集 Dice 系数作为项目验收核心指标。',
    summaryVivid:
      '想象一位放射科医生在看 CT：不仅要判断「有没有结节」，还要用荧光笔把结节轮廓精确圈出来。' +
      '本步任务是把这场「圈病灶」考试的规则写清楚——输入什么影像、输出什么掩膜、怎样算合格。',
    summaryBridge:
      '「荧光笔圈病灶」即任务说明--专业版中的像素级分割输出；「CT 切片」对应单通道灰度输入；' +
      '「圈得准不准」对应验证集 Dice 系数（Dice coefficient）验收标准；' +
      '「只管圈图、不管建数据库」则对应系统边界限定为推理（Inference），不含采集与部署。',
    actions: [
      '撰写问题陈述：定义输入切片规格与输出掩膜语义（0=背景，1=病灶）',
      '区分系统边界：聚焦「影像 → 掩膜」映射，不涉及检测框-only 或三维体积分割',
      '确定验收口径：以独立验证集 Dice 衡量泛化，而非训练集 loss',
      '对照内置方案，确认五模块流水线与上述目标一致',
    ],
    deliverables: ['问题定义文档', '输入输出规格', '验收指标约定'],
    termNotes: [
      { term: '像素级掩膜', note: '与 CT 切片同大小的二值图，白色区域表示模型判为病灶的像素。' },
      { term: 'Dice 系数', note: '预测区域与真实标注重叠程度的数值，0 到 1，越高越好。' },
    ],
    faq: [],
  },
  {
    title: '确定任务类型',
    summary:
      '将本项目归类为医学影像语义分割任务，采用监督学习：利用像素级标注掩膜学习从影像到掩膜的映射；' +
      '强调训练集用于参数学习、验证集用于泛化评估，避免病例级数据泄漏。',
    summaryVivid:
      '这不是「整张图猜有没有病」的选择题，而是「每个像素都要填背景还是病灶」的填色游戏。' +
      '老师给你带标准答案的练习册（训练集），学完在没见过的卷子上考试（验证集），两本卷子不能混。',
    summaryBridge:
      '「填色游戏」即语义分割（Semantic Segmentation）；「带标准答案的练习册」即带掩膜标注的训练集；' +
      '「没见过的卷子」即独立验证集；「两本不能混」对应病例/切片划分防泄漏（Data Leakage）要求。',
    actions: [
      '确认任务范式：语义分割，每张切片对应同尺寸掩膜',
      '理解监督信号：掩膜每个像素提供 0/1 标签',
      '辨析与分类/检测差异：分割需像素级输出，非整图类别或框',
      '建立泛化意识：验证集须未参与训练与调参',
    ],
    deliverables: ['任务类型判定', '学习范式说明', '划分原则'],
    termNotes: [
      { term: '语义分割', note: '同一类别像素共享标签，本项目仅背景与病灶两类。' },
      { term: '监督学习', note: '每条样本都有标注掩膜，模型从标注中学习规律。' },
    ],
    faq: [],
  },
  {
    title: '确定数据方案',
    summary:
      '选定公开肺部 CT 切片数据集（如 LUNA16 子集）：影像与二值掩膜成对，统一尺寸与窗宽窗位预处理；' +
      '明确 train/val 划分策略（建议按病例 ID），并列出对齐、取值范围等质检项。',
    summaryVivid:
      '数据像成对的「CT 照片 + 透明蒙版」：蒙版哪里涂白，哪里就是病灶。' +
      '本步要弄清照片从哪来、蒙版是否对齐、训练卷和考试卷怎么分。',
    summaryBridge:
      '「CT 照片 + 透明蒙版」即影像–掩膜对；「涂白区域」即病灶像素标签；' +
      '「训练卷/考试卷」即训练集与验证集（Validation Set）；' +
      '「按病人分卷」则对应按病例 ID 划分以防泄漏。',
    actions: [
      '确认数据集选型：公开肺部 CT 切片 + 病灶掩膜，满足监督分割需求',
      '掌握样本规格：切片分辨率、掩膜二值化、HU 值范围',
      '理解划分原则：train/val 按病例分离，禁止同一患者跨集',
      '列出质检项：尺寸一致、掩膜对齐、类别比例',
    ],
    deliverables: ['数据集说明', '样本–掩膜 schema', '质检清单'],
    termNotes: [
      { term: 'HU 值', note: 'CT 像素的标准化密度单位，预处理时常用窗宽窗位截断。' },
      { term: 'LUNA16', note: '公开肺部结节 CT 数据集，常用于分割与检测研究。' },
    ],
    faq: [],
  },
  {
    title: '确定模型方案',
    summary:
      '选用 U-Net 作为基线分割网络：编码器提取特征、解码器恢复分辨率，跳跃连接保留边界；' +
      '损失函数采用 Dice Loss，优化预测掩膜与标注的重叠；理解 batch 训练与 GPU 加速要点。',
    summaryVivid:
      'U-Net 像一台「先压缩理解、再放大还原」的复印机：先看清整张 CT 大意，再逐像素还原病灶边界，' +
      '中间把细节通过「跳跃线」直接传回去，避免圈边界圈糊。',
    summaryBridge:
      '「压缩–放大复印机」即编码器–解码器（Encoder–Decoder）结构；「跳跃线」即跳跃连接（Skip Connection）；' +
      '「圈边界别糊」对应 Dice Loss 优化重叠；「复印机」整体即 U-Net 架构选型。',
    actions: [
      '明确网络结构：U-Net 输入 1 通道灰度，输出 1 通道 logits/sigmoid',
      '理解 Dice Loss：直接优化区域重叠，适合小病灶',
      '关注训练配置：batch size、学习率、epoch 与 early stopping',
      '对比更复杂模型：U-Net 作为可解释 baseline',
    ],
    deliverables: ['模型选型说明', '损失函数约定', '训练超参初值'],
    termNotes: [
      { term: 'U-Net', note: 'U 形全卷积网络，医学图像分割最常用 baseline 之一。' },
      { term: 'Dice Loss', note: '基于 Dice 系数的损失，对小目标更敏感。' },
    ],
    faq: [],
  },
  {
    title: '确定评估方式',
    summary:
      '以验证集 Dice 与 IoU 为主要指标；可记录灵敏度/特异度分析漏检与误检；' +
      '禁止在调参过程中反复用验证集「偷看」选模型，应保留 hold-out 测试或单次最终评估。',
    summaryVivid:
      '模型画完圈要和标准答案叠在一起比：重合越多 Dice 越高。' +
      '不能一边改模型一边偷看验证集分数挑最好的那次——那相当于开卷考试。',
    summaryBridge:
      '「叠图比重合」即 Dice 与 IoU（Intersection over Union）计算；' +
      '「开卷考试」对应验证集窥视（Peeking）导致的评估失真；' +
      '「漏圈/多圈」可结合灵敏度（Sensitivity）与特异度（Specificity）分析。',
    actions: [
      '定义主指标：验证集平均 Dice，辅以 IoU',
      '理解指标局限：小病灶 Dice 波动大，需多样本平均',
      '建立基线阈值：记录首次可达 Dice 范围作为对照',
      '避免评估陷阱：调参时不反复刷验证集最优',
    ],
    deliverables: ['评估指标定义', 'Dice/IoU 解读要点', '基线阈值'],
    termNotes: [
      { term: 'IoU', note: '交集除以并集，分割常用，与 Dice 相关但数值略低。' },
      { term: '灵敏度', note: '真实病灶中被正确圈出的比例，反映漏检情况。' },
    ],
    faq: [],
  },
  {
    title: '划分项目模块',
    summary:
      '将端到端流水线拆解为五个模块：config → load_data → preprocess → train_unet → evaluate；' +
      '理解模块间数据流：原始 CT → 归一化张量 → 训练权重 → 预测掩膜与指标报告。',
    summaryVivid:
      '五个岗位流水线：有人管配置、有人搬 CT 和蒙版、有人调窗、有人训练 U-Net、有人打分验圈。',
    summaryBridge:
      '「五个岗位」对应配置、加载数据、预处理、训练网络、评估五个模块；' +
      '「流水线」即端到端流水线（End-to-End Pipeline）；' +
      '「前站输出是后站输入」描述 原始 CT → 归一化张量 → 模型权重 → 掩膜与 Dice 指标 的数据流。',
    actions: [
      '梳理模块职责：各模块输入、输出与单一职责',
      '绘制数据流：CT/掩膜 → 张量 → 权重 → 预测与指标',
      '确认执行顺序：配置 → 加载 → 预处理 → 训练 → 评估',
      '对照内置代码块：映射到五个 .py 文件',
    ],
    deliverables: ['模块职责表', '数据流图', '执行顺序清单'],
    termNotes: [
      { term: '端到端流水线', note: '从原始数据到最终指标的一整条可复现链路。' },
      { term: 'checkpoint', note: '训练过程中保存的模型权重文件，便于恢复与部署。' },
    ],
    faq: [],
  },
]

const analysisStepQuestions: FollowUpQuestion[] = [
  {
    question: '肺部病灶分割属于哪类视觉任务？',
    answer_type: 'choice',
    options: ['语义分割', '图像分类', '目标跟踪', '其他'],
  },
  {
    question: '语义分割的训练标签是什么形式？',
    answer_type: 'choice',
    options: ['像素级掩膜', '整图类别', '边界框', '其他'],
  },
  {
    question: '医学分割常用 U-Net 的主要原因是什么？',
    answer_type: 'choice',
    options: ['结构适合小样本与边界细节', '一定比 Transformer 快', '只能用于 CT', '其他'],
  },
  {
    question: '为什么验证集 Dice 比训练 loss 更能反映泛化？',
    answer_type: 'text',
    options: [],
  },
  {
    question: 'load_data 与 preprocess 模块的职责分别是什么？',
    answer_type: 'text',
    options: [],
  },
]

const operationStepQuestions: FollowUpQuestion[] = [
  {
    question: '肺部病灶分割属于计算机专业中的哪个方向？',
    answer_type: 'choice',
    options: ['医学影像 AI', '数据库索引', '编译原理', '其他'],
  },
  {
    question: '实现 U-Net 训练，优先选用哪类框架？',
    answer_type: 'choice',
    options: ['PyTorch', 'HTML', 'SQL', '其他'],
  },
  {
    question: '语义分割为什么需要影像与掩膜成对出现？',
    answer_type: 'text',
    options: [],
  },
  {
    question: '划分 train/val 时，为什么建议按病例而非随机切片？',
    answer_type: 'text',
    options: [],
  },
  {
    question: 'CT 肺窗预处理的作用是什么？',
    answer_type: 'text',
    options: [],
  },
  {
    question: '验证集 Dice 偏低时，可能有哪些原因？',
    answer_type: 'choice',
    options: ['标注未对齐或模型欠拟合', 'Dice 一定等于 1', '与 batch size 无关', '其他'],
  },
]

export const LUNG_LESION_SEGMENTATION_PROJECT: PresetProject = {
  id: LUNG_LESION_PROJECT_ID,
  name: '肺部病灶分割',
  shortDescription:
    '基于胸部 CT 切片与 U-Net，完成肺部病灶语义分割的医学影像入门项目。',
  output: {
    task_summary: '肺部病灶分割：CT 切片 + U-Net + Dice/IoU 评估的完整分割流程。',
    logic_plan: logicPlan,
    execution_steps: executionSteps,
    code_blocks: codeBlocks,
    terms,
    follow_up_questions: [],
    socratic_mode: true,
    assistant_message: '',
    analysis_complete: true,
    operations_complete: true,
  },
  analysisTasks,
  analysisStepQuestions,
  analysisCompleteQuestion: {
    question: '以上项目解析是否清晰？确认后进入操作描述阶段。',
    answer_type: 'choice',
    options: ['确认，进入操作描述', '还需回顾', '其他'],
  },
  operationStepQuestions,
  operationCompleteQuestion: {
    question: '以上操作描述是否清晰？确认后进入代码设计阶段。',
    answer_type: 'choice',
    options: ['确认，进入代码设计', '还需补充', '其他'],
  },
  codeStepQuestions: [
    {
      question: 'config.py 中 IMAGE_SIZE 为何需要固定？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'load_data 如何保证影像与掩膜一一对应？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'preprocess 中肺窗截断的作用是什么？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'train_unet 中 Dice Loss 与交叉熵相比有何优势？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'evaluate 输出的 Dice 与 IoU 如何解读？',
      answer_type: 'text',
      options: [],
    },
  ],
}
