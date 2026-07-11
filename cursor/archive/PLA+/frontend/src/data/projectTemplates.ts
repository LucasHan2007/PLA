import type { ProjectTemplate } from '../types'

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'mnist',
    name: 'MNIST 手写数字识别',
    hint: '使用 KNN 或简单神经网络完成 0–9 分类，Python + scikit-learn',
  },
  {
    id: 'lung-seg',
    name: '肺部病灶语义分割',
    hint: '胸部 CT 图像，U-Net 语义分割，PyTorch',
  },
  {
    id: 'todo',
    name: 'Todo 待办应用',
    hint: 'Web 或命令行，增删改查与持久化',
  },
]
