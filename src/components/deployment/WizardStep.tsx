import React from 'react';
import { ChevronDown, ChevronRight, Check, Circle, Loader2 } from 'lucide-react';

interface WizardStepProps {
  number: number;
  title: string;
  description: string;
  isOpen: boolean;
  isCompleted: boolean;
  isActive: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const WizardStep: React.FC<WizardStepProps> = ({
  number, title, description, isOpen, isCompleted, isActive, onToggle, children, icon
}) => {
  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-300 ${
      isActive ? 'border-cyan-500 shadow-lg shadow-cyan-500/10' : 
      isCompleted ? 'border-green-500/50' : 'border-gray-700'
    }`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-4 p-5 transition-colors ${
          isActive ? 'bg-gray-800' : 'bg-gray-800/50 hover:bg-gray-800'
        }`}
      >
        <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${
          isCompleted ? 'bg-green-500 text-white' :
          isActive ? 'bg-cyan-500 text-gray-900' : 'bg-gray-700 text-gray-400'
        }`}>
          {isCompleted ? <Check className="h-5 w-5" /> : number}
        </div>
        <div className="flex-1 text-left">
          <h4 className="text-white font-semibold">{title}</h4>
          <p className="text-gray-400 text-sm">{description}</p>
        </div>
        {icon && <div className="mr-2">{icon}</div>}
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="p-5 bg-gray-900 border-t border-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};
