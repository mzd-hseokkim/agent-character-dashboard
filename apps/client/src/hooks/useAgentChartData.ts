import { useChartData } from './useChartData';

export function useAgentChartData(agentName: string) {
  return useChartData(agentName);
}
