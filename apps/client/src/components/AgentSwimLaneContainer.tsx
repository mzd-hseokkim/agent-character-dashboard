import type { HookEvent, TimeRange } from '../types';
import { AgentSwimLane } from './AgentSwimLane';

interface Props {
  selectedAgents: string[];
  events: HookEvent[];
  timeRange: TimeRange;
  onSelectedAgentsChange: (agents: string[]) => void;
}

export function AgentSwimLaneContainer({ selectedAgents, events, timeRange, onSelectedAgentsChange }: Props) {
  if (!selectedAgents.length) return null;

  const removeAgent = (agent: string) => {
    onSelectedAgentsChange(selectedAgents.filter(a => a !== agent));
  };

  return (
    <div className="w-full" style={{ animation: 'swimLaneSlideIn 0.3s ease' }}>
      <style>{`
        @keyframes swimLaneSlideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex flex-col gap-2 w-full">
        {selectedAgents.map(agent => (
          <AgentSwimLane
            key={agent}
            agentName={agent}
            events={events}
            timeRange={timeRange}
            onClose={() => removeAgent(agent)}
          />
        ))}
      </div>
    </div>
  );
}
