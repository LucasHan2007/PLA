import type { AnalysisStepTask } from '../types/analysisTask'
import type {
  AIStructuredOutput,
  CodeBlock,
  ExecutionStep,
  FollowUpQuestion,
  LogicPlanItem,
  TermDefinition,
} from '../types'

export const MNIST_PROJECT_ID = 'mnist-digit'

export interface PresetProject {
  id: string
  name: string
  shortDescription: string
  output: AIStructuredOutput
  /** 项目解析各步的具体任务（与 logic_plan 一一对应） */
  analysisTasks: AnalysisStepTask[]
  /** 揭示 logic_plan 第 2…N 项前的引导题（操作/代码阶段使用，解析阶段已弃用） */
  analysisStepQuestions: FollowUpQuestion[]
  /** 全部解析项揭示后的确认题 */
  analysisCompleteQuestion: FollowUpQuestion
  /** 按小步骤扁平顺序的引导题（长度 = 小步骤总数） */
  operationStepQuestions: FollowUpQuestion[]
  /** 全部操作揭示后的确认题 */
  operationCompleteQuestion: FollowUpQuestion
  /** 按代码块顺序的引导题 */
  codeStepQuestions: FollowUpQuestion[]
}

const logicPlan: LogicPlanItem[] = [
  {
    id: 1,
    title: '项目目标',
    content:
      '构建一个手写数字识别系统：输入 28×28 灰度图像，输出 0–9 的数字类别。适合作为计算机视觉入门项目，从数据到模型评估走通完整流程。',
  },
  {
    id: 2,
    title: '任务类型',
    content:
      '属于图像分类任务（Image Classification）：每张图对应一个离散标签（0–9）。采用监督学习，需要带标签的训练集与独立的测试集评估泛化能力。',
  },
  {
    id: 3,
    title: '数据方案',
    content:
      '使用 MNIST 公开数据集：60,000 张训练图 + 10,000 张测试图，每张 28×28 像素、单通道灰度，标签为 0–9 整数。可通过 scikit-learn 在线获取，无需自行标注。',
  },
  {
    id: 4,
    title: '模型选择',
    content:
      '入门阶段选用 K 近邻（KNN）分类器：将图像展平为 784 维向量，基于欧氏距离找最近 K 个训练样本投票。实现简单、无需训练迭代，便于理解「特征 → 分类」流程。',
  },
  {
    id: 5,
    title: '评估指标',
    content:
      '主要指标为测试集准确率（Accuracy）；可辅以混淆矩阵观察易混淆数字对（如 3 与 8）。目标准确率通常可达 95% 以上（KNN + MNIST）。',
  },
  {
    id: 6,
    title: '模块划分',
    content:
      '拆为五个代码模块：config（配置）、load_data（加载 MNIST）、preprocess（展平与归一化）、train_knn（训练分类器）、evaluate（测试集评估与试测）。',
  },
]

const executionSteps: ExecutionStep[] = [
  {
    step_id: 1,
    title: '搭建开发环境',
    logic_plan_ref: 2,
    description: '为手写识别项目准备可运行的 Python 开发与依赖环境',
    sub_steps: [
      {
        sub_id: 1,
        title: '安装 Python',
        rationale: '手写数字识别属于计算机视觉领域，使用 Python 语言能更容易达成目标功能',
        description: '确认本机已安装 Python 3.8 或以上；在终端运行 python --version 验证。',
        why: 'Python 是 CV/ML 生态最通用的语言，后续库都依赖它。',
        inputs: '可联网的计算机',
        outputs: '已安装且版本符合要求的 Python',
        knowledge_points: ['Python', '开发环境'],
        code_module: '',
        common_errors: ['未加入 PATH', '版本低于 3.8'],
        next_hint: '记录 Python 版本号',
      },
      {
        sub_id: 2,
        title: '创建虚拟环境并安装依赖',
        rationale: '隔离项目依赖，避免与系统 Python 包冲突，便于复现环境',
        description:
          '在项目目录执行 python -m venv venv 创建虚拟环境；激活后 pip 安装 numpy、opencv-python 与 scikit-learn。',
        why: '虚拟环境保证依赖版本一致，scikit-learn 提供 KNN 与 MNIST 加载能力。',
        inputs: 'Python 环境、项目目录',
        outputs: '已激活的虚拟环境及已安装依赖',
        knowledge_points: ['虚拟环境', 'pip'],
        code_module: '',
        common_errors: ['pip 装错 Python 版本', '未激活虚拟环境'],
        next_hint: '确认能正常 import sklearn',
      },
    ],
  },
  {
    step_id: 2,
    title: '获取 MNIST 数据集',
    logic_plan_ref: 3,
    description: '获取带标签的手写数字样本，供后续训练与测试',
    sub_steps: [
      {
        sub_id: 1,
        title: '在线下载 MNIST 数据',
        rationale: 'KNN 监督学习需要带标签的训练样本，MNIST 是手写数字识别的标准入门数据集',
        description:
          '通过 scikit-learn 的 fetch_openml 在线获取 MNIST；检查样本数量与标签范围是否为 0–9。',
        why: 'KNN 需要带标签的训练样本才能学习分类边界。',
        inputs: '网络连接',
        outputs: '训练集与测试集的图像矩阵及标签',
        knowledge_points: ['MNIST', '监督学习'],
        code_module: 'load_data.py',
        common_errors: ['首次下载超时', '标签与图像数量不一致'],
        next_hint: '记录训练集/测试集各有多少张图',
      },
      {
        sub_id: 2,
        title: '检查数据格式与规模',
        rationale: '了解数据形状有助于设计后续预处理与评估方案',
        description: '查看图像尺寸是否为 28×28、标签是否为 0–9 整数；统计各类别样本数量是否均衡。',
        why: '数据格式错误会导致后续预处理与训练失败。',
        inputs: '已下载的 MNIST 数据',
        outputs: '数据规模与格式确认记录',
        knowledge_points: ['数据探索', '标签分布'],
        code_module: 'load_data.py',
        common_errors: ['未区分训练/测试集', '标签类型错误'],
        next_hint: '明确每张图的像素维度',
      },
    ],
  },
  {
    step_id: 3,
    title: '图像预处理与模型训练',
    logic_plan_ref: 4,
    description: '将原始图像转为 KNN 可用的特征，并完成训练与评估',
    sub_steps: [
      {
        sub_id: 1,
        title: '图像展平与归一化',
        rationale: 'KNN 基于向量距离分类，需要统一维度和数值范围',
        description:
          '将每张 28×28 图像展平为一维向量（784 维）；像素值归一化到 0–1；确保特征矩阵行数等于样本数。',
        why: '距离度量对量纲敏感，归一化避免大数值主导距离。',
        inputs: '原始图像矩阵',
        outputs: '特征向量矩阵',
        knowledge_points: ['特征向量', '归一化'],
        code_module: 'preprocess.py',
        common_errors: ['展平顺序错误', '未归一化导致距离失真'],
        next_hint: '明确每个样本特征向量的长度',
      },
      {
        sub_id: 2,
        title: '训练 KNN 并评估',
        rationale: '完成分类器训练并在未见数据上验证泛化能力',
        description:
          '配置 K 值（如 3 或 5），用 scikit-learn KNN 在训练集上拟合；在测试集上预测并统计准确率。',
        why: '测试集评估反映模型真实泛化能力。',
        inputs: '训练/测试特征与标签',
        outputs: '已训练模型与准确率',
        knowledge_points: ['KNN', '准确率'],
        code_module: 'train_knn.py',
        common_errors: ['用训练集评估导致虚高', 'K 值选择不当'],
        next_hint: '判断准确率是否满足项目目标',
      },
    ],
  },
]

const codeBlocks: CodeBlock[] = [
  {
    file_name: 'config.py',
    language: 'python',
    code: `# 手写数字识别 — 项目配置
PROJECT_NAME = "mnist_digit_knn"
RANDOM_STATE = 42
KNN_K = 5
DATA_HOME = "./data"
`,
    annotations: [
      { line: '1', text: '集中管理常量，便于实验时统一修改。' },
      { line: '3', text: 'KNN 的 K 值：邻居数量，影响分类边界平滑程度。' },
    ],
  },
  {
    file_name: 'load_data.py',
    language: 'python',
    code: `from sklearn.datasets import fetch_openml

def load_mnist():
    """加载 MNIST，返回 (X_train, y_train, X_test, y_test)。"""
    mnist = fetch_openml("mnist_784", version=1, as_frame=False, parser="auto")
    X, y = mnist.data, mnist.target.astype(int)
    X_train, X_test = X[:60000], X[60000:]
    y_train, y_test = y[:60000], y[60000:]
    return X_train, y_train, X_test, y_test
`,
    annotations: [
      { line: '1', text: 'fetch_openml 从 OpenML 在线获取 MNIST。' },
      { line: '6', text: '前 60000 为训练集，后 10000 为测试集（标准划分）。' },
    ],
  },
  {
    file_name: 'preprocess.py',
    language: 'python',
    code: `import numpy as np

def preprocess(X):
    """展平已在 MNIST 中为 784 维；归一化到 [0, 1]。"""
    X = X.astype(np.float32) / 255.0
    return X
`,
    annotations: [
      { line: '4', text: '像素原值 0–255，除以 255 归一化，避免距离被大数值主导。' },
    ],
  },
  {
    file_name: 'train_knn.py',
    language: 'python',
    code: `from sklearn.neighbors import KNeighborsClassifier
from config import KNN_K, RANDOM_STATE

def train_knn(X_train, y_train):
    clf = KNeighborsClassifier(n_neighbors=KNN_K)
    clf.fit(X_train, y_train)
    return clf
`,
    annotations: [
      { line: '5', text: 'fit 阶段 KNN 存储训练样本，预测时找最近 K 个邻居投票。' },
    ],
  },
  {
    file_name: 'evaluate.py',
    language: 'python',
    code: `from sklearn.metrics import accuracy_score

def evaluate(clf, X_test, y_test):
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"测试集准确率: {acc:.4f}")
    return acc
`,
    annotations: [
      { line: '4', text: 'accuracy_score 统计预测正确的比例。' },
    ],
  },
]

const terms: TermDefinition[] = [
  { term: 'MNIST', definition: '经典手写数字数据集，28×28 灰度图，标签 0–9。' },
  { term: 'KNN', definition: 'K 近邻分类：根据最近的 K 个训练样本的标签投票决定类别。' },
  { term: '监督学习', definition: '使用带标签样本训练模型，学习输入到输出的映射。' },
  { term: '归一化', definition: '将特征缩放到统一数值范围，避免量纲差异影响距离计算。' },
  { term: '准确率', definition: '预测正确的样本数占总样本数的比例。' },
]

const analysisTasks: AnalysisStepTask[] = [
  {
    title: '明确项目目标',
    summary:
      '从问题定义角度梳理手写数字识别系统的边界：明确输入为 28×28 单通道灰度图像，输出为离散类别标签（0–9）；' +
      '界定系统职责为端到端推理（Inference），而非数据采集或模型部署；' +
      '以测试集分类准确率作为项目验收的核心指标，建立可量化的完成标准。',
    summaryVivid:
      '想象你在设计一台「数字识别机」：它收到一张小小的黑白格子画（28×28），必须一眼说出是 0 还是 9。' +
      '本步的任务，就是先把这场「考试」的规则写清楚——考什么、怎么输入输出、多少分算及格；' +
      '至于去哪里找题、怎么上线部署，那是后面的事，现在先把靶心画准。',
    summaryBridge:
      '上面说的「数字识别机」就是专业版里的手写数字识别系统；「黑白格子画 28×28」对应 28×28 单通道灰度图像输入，' +
      '「一眼说出 0 还是 9」对应输出离散类别标签 {0,…,9}；「考试规则与及格线」即问题定义与测试集 Top-1 Accuracy 验收标准；' +
      '「暂不涉及找题和部署」则对应专业版中系统边界限定为 Inference，不含数据采集与模型部署。',
    actions: [
      '撰写问题陈述：定义输入张量规格（H×W×C = 28×28×1）与输出标签空间 {0,…,9}',
      '区分系统边界：本项目聚焦「图像 → 类别」映射，不涉及目标检测、语义分割或 OCR 流水线',
      '确定验收口径：以独立测试集上的 Top-1 Accuracy 衡量模型泛化性能，而非训练集拟合效果',
      '对照内置方案，确认五模块流水线（配置 → 加载 → 预处理 → 训练 → 评估）与上述目标一致',
    ],
    deliverables: ['问题定义文档', 'I/O 规格说明', '验收指标约定'],
    termNotes: [
      {
        term: '单通道灰度图像',
        note: '每张图每个像素只有一个亮度值（0 表示黑、255 表示白），没有红、绿、蓝三个颜色通道，因此比彩色图更简单。',
      },
      {
        term: '离散类别标签',
        note: '输出不是连续数值，而是从 0 到 9 中选一个整数，表示「这张图是几号数字」。',
      },
      {
        term: '端到端推理（Inference）',
        note: '把已经训练好的模型拿来用：输入一张新图片，直接得到预测结果，本步不涉及重新采集数据或上线部署。',
      },
      {
        term: 'Top-1 Accuracy',
        note: '模型预测概率最高的那个类别是否等于真实标签；预测对了计 1 分，最后算正确率。',
      },
      {
        term: '泛化性能',
        note: '模型在「没见过的数据」上表现如何；只在训练集上考高分，不代表真正学会了识别新图片。',
      },
    ],
    faq: [
      {
        keywords: ['目标', '做什么'],
        answer: '即：读入手写数字图像，输出 0–9 类别，并用测试集准确率衡量是否做好。',
      },
    ],
  },
  {
    title: '确定任务类型',
    summary:
      '将本项目归类为计算机视觉中的图像分类（Image Classification）任务，采用监督学习（Supervised Learning）范式：' +
      '利用带标注样本学习从特征空间到标签空间的映射函数；' +
      '强调训练集用于参数/记忆构建、测试集用于泛化评估，避免数据泄漏（Data Leakage）。',
    summaryVivid:
      '这个项目像一场「看图报数」游戏：老师发给你一叠带标准答案的练习册（训练集），你学完后参加正式测验（测试集）。' +
      '你要确认的是：我们玩的是「整张图猜一个数字」，不是在图里框出数字在哪，也不是给每个像素涂颜色。' +
      '练习册和期末卷必须分开，否则就像把考题提前泄露，分数就不作数了。',
    summaryBridge:
      '「练习册 / 正式测验」即专业版中的训练集与 hold-out 测试集；「整张图猜一个数字」对应 Image Classification 单标签多分类；' +
      '「不框数字、不给像素涂色」说明本项目不是目标检测或语义分割；「标准答案」即 ground-truth 标签，「带答案学习」即监督学习范式；' +
      '「考题不能提前泄露」则对应专业版强调的数据泄漏（Data Leakage）风险——测试集信息不得混入训练或调参。',
    actions: [
      '确认任务范式：单标签多分类（Multi-class Classification），每张图像对应唯一 ground-truth 标签',
      '理解监督信号来源：训练样本的 (image, label) 对构成学习的目标函数与评价依据',
      '辨析与相关任务差异：分类（整图判类）vs. 检测（定位+分类）vs. 分割（像素级标注）',
      '建立泛化意识：模型性能须在未参与训练的 hold-out 测试集上验证，而非仅报告训练集指标',
    ],
    deliverables: ['任务类型判定', '学习范式说明', '评估数据划分原则'],
    termNotes: [
      {
        term: '图像分类（Image Classification）',
        note: '给整张图贴一个类别标签，例如「这是数字 7」；不需要指出数字在图的哪个位置。',
      },
      {
        term: '监督学习（Supervised Learning）',
        note: '训练数据里每张图都附带正确答案（标签），模型通过「看例题+对答案」来学习规律。',
      },
      {
        term: 'ground-truth 标签',
        note: '人工标注或数据集提供的「标准答案」，用来告诉模型这张图真实属于哪一类。',
      },
      {
        term: 'hold-out 测试集',
        note: '从训练过程中完全留出来、最后才用来考试的数据；相当于模拟模型将来遇到的新样本。',
      },
      {
        term: '数据泄漏（Data Leakage）',
        note: '测试集的信息不小心混进了训练或调参环节，会导致分数虚高、无法反映真实能力。',
      },
    ],
    faq: [
      {
        keywords: ['分类', '检测'],
        answer: '本项目对整图判类别，是分类任务；不涉及定位数字框。',
      },
    ],
  },
  {
    title: '确定数据方案',
    summary:
      '选定 MNIST 作为基准数据集（Benchmark Dataset）：60,000 张训练样本与 10,000 张测试样本，' +
      '图像分辨率 28×28、单通道灰度，标签为 0–9 整数；' +
      '明确数据获取路径（如 scikit-learn.datasets.fetch_openml）及样本–标签对齐、类别分布等质量检查要点。',
    summaryVivid:
      'MNIST 就像机器学习界的「九九乘法表」——几乎人人练过。6 万张练习题加 1 万张期末考卷，每张都是小小的黑白手写数字。' +
      '本步你要搞清楚：这批「习题册」从哪来、每张图长什么样、标准答案是 0–9 里的哪一个，' +
      '还要像图书管理员一样核对：有没有缺页、标签贴错、某个数字特别少的情况。',
    summaryBridge:
      '「九九乘法表」即专业版中的 Benchmark Dataset——MNIST；「6 万练习题 + 1 万期末卷」对应 60,000 训练样本与 10,000 测试样本；' +
      '「小小黑白手写数字」即 28×28 单通道灰度图，展平后为 784 维像素向量；「标准答案 0–9」即标签空间 cardinality = 10；' +
      '「图书管理员核对缺页、贴错、某类偏少」则对应专业版中的样本–标签 schema 校验与 class balance 等数据质量检查。',
    actions: [
      '确认数据集选型：MNIST 作为手写数字识别的标准入门基准，满足监督分类的数据规模与标注质量要求',
      '掌握样本规格：每张图像对应 784 维原始像素向量（展平前为 28×28），标签空间 cardinality = 10',
      '理解官方划分：训练集 / 测试集已预先分离，评估时严禁将测试样本混入训练过程',
      '列出数据质检项：图像尺寸一致性、标签值域 [0,9]、各类别样本量是否近似均衡（class balance）',
    ],
    deliverables: ['数据集选型说明', '样本–标签 schema', '数据质量检查清单'],
    termNotes: [
      {
        term: '基准数据集（Benchmark Dataset）',
        note: '领域内大家都用的标准数据集，便于比较不同方法；MNIST 就是手写数字识别的经典基准。',
      },
      {
        term: '784 维像素向量',
        note: '28×28 = 784 个像素，把二维图像按行或列排成一长串数字，方便算法处理。',
      },
      {
        term: 'cardinality = 10',
        note: '标签一共有 10 种可能取值（数字 0 到 9），即 10 个类别。',
      },
      {
        term: 'class balance（类别均衡）',
        note: '每个数字的样本数量是否差不多；若某类特别少，模型可能偏向预测常见类别。',
      },
      {
        term: '样本–标签 schema',
        note: '描述数据长什么样：例如「每张图对应一个 0–9 的整数标签」，相当于数据的结构说明书。',
      },
    ],
    faq: [
      {
        keywords: ['mnist', '数据'],
        answer: 'MNIST 是手写数字识别的标准入门数据集，内置方案已采用，无需另选数据。',
      },
    ],
  },
  {
    title: '确定模型方案',
    summary:
      '选用 K 近邻（K-Nearest Neighbors, KNN）作为基线分类器：将图像展平为 784 维特征向量，' +
      '基于欧氏距离（Euclidean Distance）检索训练集中最近的 K 个样本，以多数投票（Majority Voting）决定预测类别；' +
      '理解其 lazy learning 特性——无显式训练迭代，推理阶段依赖训练集存储与距离计算。',
    summaryVivid:
      'KNN 的思路特别接地气：遇到一张陌生图片，就去题库里找长得最像的 K 个「师兄师姐」，听他们多数说是几，你就猜几。' +
      '不用复杂的公式反复训练，相当于「近朱者赤，近墨者黑」——谁和你最像，你就跟谁学。' +
      'K 选太大，容易被「大众脸」带偏；K 选太小，又容易被个别怪样本误导，本步要把这套直觉建立起来。',
    summaryBridge:
      '「找最像的 K 个师兄师姐投票」即 KNN 的 Top-K 近邻检索与 Majority Voting；「题库」即训练集，预测时临时比对体现 lazy learning 特性；' +
      '「长得像」由欧氏距离在 784 维特征向量上度量；「把图变成一串数字」即图像展平为特征表示；' +
      '「K 太大 / 太小」的直觉，对应专业版中的 bias–variance 权衡与超参数 K 的选取。',
    actions: [
      '明确特征表示：将 28×28 图像 reshape 为 784 维向量，作为 KNN 的输入特征空间',
      '理解算法机制：距离度量 → Top-K 近邻检索 → 标签投票，建立「相似样本 → 相同类别」的 inductive bias',
      '关注超参数 K：K 值影响 bias–variance 权衡，过小易过拟合噪声，过大易欠拟合边界细节',
      '对比深度模型定位：KNN 作为可解释、易实现的 baseline，便于理解分类流程后再进阶神经网络',
    ],
    deliverables: ['模型选型说明', '特征工程方案', 'K 值与距离度量约定'],
    termNotes: [
      {
        term: 'K 近邻（KNN）',
        note: '预测时找训练集中与当前图片最像的 K 张图，看它们多数是几，就预测为几；思路是「物以类聚」。',
      },
      {
        term: '特征向量',
        note: '把图像转成一串数字（这里是 784 个数），每个数代表一个像素的亮度，供算法计算相似度。',
      },
      {
        term: '欧氏距离',
        note: '衡量两串数字有多「像」：对应位置差值平方再开方；距离越小，图像越相似。',
      },
      {
        term: 'lazy learning',
        note: 'KNN 几乎不在训练阶段做复杂计算，主要把训练样本存起来，预测时再临时比对，所以叫「懒惰学习」。',
      },
      {
        term: 'bias–variance 权衡',
        note: 'K 太小：模型太敏感、易记噪声（过拟合）；K 太大：模型太粗糙、边界模糊（欠拟合）；需要在中间找平衡。',
      },
    ],
    faq: [
      {
        keywords: ['knn', '模型'],
        answer: 'KNN 是内置方案的入门选型，重点理解「用训练样本投票预测类别」即可。',
      },
    ],
  },
  {
    title: '确定评估方式',
    summary:
      '以测试集准确率（Accuracy = 正确预测数 / 总样本数）作为主要评估指标；' +
      '辅以混淆矩阵（Confusion Matrix）分析易混淆类别对（如 3↔8、4↔9）；' +
      'MNIST + KNN 基线通常可达 95% 以上 Top-1 Accuracy，需区分训练集过拟合与真实泛化能力。',
    summaryVivid:
      '模型造好后，要办一场「盲测」：用从未见过的 1 万张图当考卷，看能答对几成。95 分以上通常算优秀。' +
      '若 3 常被认成 8，就像两个字写得太像——混淆矩阵能把这类「脸盲错题」一张表列清楚。' +
      '切记：不能一边改模型一边偷看期末卷，那样分数再漂亮也只是自欺欺人。',
    summaryBridge:
      '「盲测 / 从未见过的考卷」即 hold-out 测试集上的泛化评估；「答对几成」对应 Top-1 Accuracy 主指标；' +
      '「95 分算优秀」即 MNIST + KNN 基线通常 ≥95% 的经验阈值；「3 被认成 8 的错题表」即 Confusion Matrix 所揭示的类别混淆模式；' +
      '「不能偷看期末卷改模型」则对应专业版禁止 peeking——调参过程中不得反复窥视测试集，以免评估失真。',
    actions: [
      '定义主指标：在 hold-out 测试集上计算 Top-1 Accuracy，作为模型验收的唯一核心数值',
      '理解指标局限：Accuracy 在类别均衡时直观，但需结合混淆矩阵观察系统性误判模式',
      '建立对比基准：记录测试集准确率是否达到 ≥95% 的经验阈值，并分析未达标时的可能原因',
      '避免评估陷阱：禁止在调参或特征选择过程中反复窥视测试集，防止间接过拟合（peeking）',
    ],
    deliverables: ['评估指标定义', '混淆矩阵解读要点', '基线性能阈值'],
    termNotes: [
      {
        term: 'Accuracy（准确率）',
        note: '预测对的样本数 ÷ 总样本数；例如 100 张里对了 95 张，准确率就是 95%。',
      },
      {
        term: '混淆矩阵（Confusion Matrix）',
        note: '一张表：行是真实类别、列是预测类别；对角线是预测正确，非对角线显示「把 A 错认成 B」的次数。',
      },
      {
        term: '过拟合（Overfitting）',
        note: '模型把训练集「背」得太好，包括噪声和特例，换到新数据就表现变差。',
      },
      {
        term: 'peeking（窥视测试集）',
        note: '调模型时反复看测试集分数来改参数，相当于提前知道考题，分数会失真。',
      },
      {
        term: '基线（baseline）',
        note: '一个简单、可复现的起步方案；后续更复杂的方法应至少比基线更好才有意义。',
      },
    ],
    faq: [
      {
        keywords: ['评估', '准确率'],
        answer: '最终在未参与训练的测试集上计算准确率，作为项目是否成功的标准。',
      },
    ],
  },
  {
    title: '划分项目模块',
    summary:
      '将端到端流水线拆解为五个职责单一的代码模块，形成可维护的项目结构：' +
      'config（全局超参与路径配置）→ load_data（MNIST 加载与划分）→ preprocess（展平与归一化）→ ' +
      'train_knn（KNN 拟合/记忆训练集）→ evaluate（测试集推理与指标报告）；' +
      '理解模块间数据流与依赖顺序，为后续操作描述与代码实现奠定基础。',
    summaryVivid:
      '把大工程拆成五个岗位，像流水线一样各司其职：有人管配置、有人搬数据、有人洗数据、有人训练模型、有人改卷打分。' +
      '前一站的输出是后一站的输入——配置没写好，后面全乱；数据没洗干净，模型再聪明也白搭。' +
      '本步要把这条「传送带」的顺序和每人的职责记在心里，后面写代码才不会串岗。',
    summaryBridge:
      '「五个岗位」对应专业版五个模块：config、load_data、preprocess、train_knn、evaluate；「流水线 / 传送带」即端到端流水线（End-to-End Pipeline）；' +
      '「前站输出是后站输入」描述 raw pixels → normalized feature matrix → fitted KNN → predictions & metrics 的数据流；' +
      '「各司其职、不串岗」则对应 Single Responsibility 原则与模块间不可颠倒的依赖顺序。',
    actions: [
      '梳理模块职责：逐一明确各模块的输入、输出及单一职责（Single Responsibility）',
      '绘制数据流：raw pixels → normalized feature matrix → fitted KNN → predictions & metrics',
      '确认执行顺序：配置初始化 → 数据加载 → 特征预处理 → 模型训练 → 离线评估，不可颠倒依赖',
      '对照内置代码块：将上述模块映射到 config / load_data / preprocess / train_knn / evaluate 五个文件',
    ],
    deliverables: ['模块职责表', '数据流图', '执行顺序清单'],
    termNotes: [
      {
        term: '端到端流水线',
        note: '从原始数据输入到最终评估结果的一整条处理链路，各步骤首尾相接、依次执行。',
      },
      {
        term: '单一职责（Single Responsibility）',
        note: '每个模块只做一件事，例如 load_data 只负责读数据，不负责训练模型，便于理解和修改。',
      },
      {
        term: '超参数',
        note: '人在训练前设定的配置，如 K 的值、数据路径；不是模型从数据里自动学出来的参数。',
      },
      {
        term: '归一化',
        note: '把像素值缩放到统一范围（如 0–1），避免数值过大或过小影响距离计算和模型表现。',
      },
      {
        term: '数据流',
        note: '数据在各模块之间如何传递：原始像素 → 处理后的特征矩阵 → 训练好的模型 → 预测与指标。',
      },
    ],
    faq: [
      {
        keywords: ['模块', '流程'],
        answer: '主线：加载数据 → 预处理 → 训练模型 → 评估结果；各模块职责在后续步骤展开。',
      },
    ],
  },
]

const analysisStepQuestions: FollowUpQuestion[] = [
  {
    question: '手写数字识别属于计算机专业中的哪个领域？',
    answer_type: 'choice',
    options: ['计算机视觉', '数据库系统', '计算机网络', '其他'],
  },
  {
    question: 'MNIST 数据集中，每张图像对应的标签表示什么？',
    answer_type: 'choice',
    options: ['0–9 的数字类别', '图像文件名', '像素坐标', '其他'],
  },
  {
    question: '入门阶段选用 KNN 而非深度网络，主要原因是什么？',
    answer_type: 'choice',
    options: ['实现简单、便于理解分类流程', 'KNN 准确率一定更高', 'MNIST 只能用 KNN', '其他'],
  },
  {
    question: '评估模型时，为什么要在独立的测试集上计算准确率？',
    answer_type: 'text',
    options: [],
  },
  {
    question: '五个代码模块中，load_data 与 preprocess 的职责分别是什么？',
    answer_type: 'text',
    options: [],
  },
]

const operationStepQuestions: FollowUpQuestion[] = [
  {
    question: '手写数字识别属于计算机专业中的哪个领域？',
    answer_type: 'choice',
    options: ['计算机视觉', '数据库系统', '计算机网络', '其他'],
  },
  {
    question: '使用哪种编程语言更容易实现计算机视觉与机器学习类项目？',
    answer_type: 'choice',
    options: ['Python', 'C++', 'Java', '其他'],
  },
  {
    question: 'KNN 监督学习为什么需要带标签的训练样本？',
    answer_type: 'text',
    options: [],
  },
  {
    question: '下载 MNIST 后，为什么要检查图像尺寸与标签范围？',
    answer_type: 'text',
    options: [],
  },
  {
    question: 'KNN 分类前为什么要对像素做归一化？',
    answer_type: 'text',
    options: [],
  },
  {
    question: '在测试集上评估时，K 值过大可能导致什么问题？',
    answer_type: 'choice',
    options: ['决策边界过于平滑、欠拟合', '训练速度变快', '准确率一定上升', '其他'],
  },
]

export const MNIST_DIGIT_PROJECT: PresetProject = {
  id: MNIST_PROJECT_ID,
  name: '手写数字识别',
  shortDescription: '基于 MNIST 数据集，使用 KNN 分类器识别 0–9 手写数字的入门视觉项目。',
  output: {
    task_summary: '手写数字识别：MNIST + KNN 分类，从数据加载到测试评估的完整入门流程。',
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
      question: 'config.py 中 KNN_K 的作用是什么？调大 K 一般会有什么影响？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'load_data.py 为何将数据划分为 60000 训练 + 10000 测试？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'preprocess 中除以 255 是在做什么？不做会怎样？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'train_knn 的 fit 与 predict 分别对应流程中的哪一步？',
      answer_type: 'text',
      options: [],
    },
    {
      question: 'evaluate 输出的准确率如何解读？你还希望补充哪些评估方式？',
      answer_type: 'text',
      options: [],
    },
  ],
}
