import { MNIST_DIGIT_PROJECT, MNIST_PROJECT_ID, type PresetProject } from './mnistDigitProject'

export const PRESET_PROJECTS: PresetProject[] = [MNIST_DIGIT_PROJECT]

export function getPresetProject(id: string): PresetProject | undefined {
  return PRESET_PROJECTS.find((p) => p.id === id)
}

export { MNIST_PROJECT_ID }
