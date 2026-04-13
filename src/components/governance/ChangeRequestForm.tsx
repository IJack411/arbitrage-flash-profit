import React, { useState } from 'react';
import { Feature } from '@/types/governance';
import { useGovernance } from '@/contexts/GovernanceContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Send } from 'lucide-react';

interface ChangeRequestFormProps {
  features: Feature[];
  onSuccess?: () => void;
}

export const ChangeRequestForm: React.FC<ChangeRequestFormProps> = ({ features, onSuccess }) => {
  const { createChangeRequest, hasPermission } = useGovernance();
  const [formData, setFormData] = useState({
    featureId: '',
    title: '',
    description: '',
    changeType: 'modify' as const,
    priority: 'medium' as const,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const feature = features.find(f => f.id === formData.featureId);
    if (!feature) return;
    
    createChangeRequest({
      ...formData,
      featureName: feature.name,
    });
    
    setFormData({ featureId: '', title: '', description: '', changeType: 'modify', priority: 'medium' });
    onSuccess?.();
  };

  if (!hasPermission('create')) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-center">
        <p className="text-gray-400">You don't have permission to create change requests.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-gray-300">Feature</Label>
          <Select value={formData.featureId} onValueChange={v => setFormData(p => ({ ...p, featureId: v }))}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue placeholder="Select feature" />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              {features.map(f => (
                <SelectItem key={f.id} value={f.id} className="text-white hover:bg-gray-700">
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-gray-300">Change Type</Label>
          <Select value={formData.changeType} onValueChange={v => setFormData(p => ({ ...p, changeType: v as 'create' | 'modify' | 'deprecate' | 'delete' }))}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700">
              <SelectItem value="create" className="text-white">Create</SelectItem>
              <SelectItem value="modify" className="text-white">Modify</SelectItem>
              <SelectItem value="deprecate" className="text-white">Deprecate</SelectItem>
              <SelectItem value="delete" className="text-white">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-gray-300">Title</Label>
        <Input
          value={formData.title}
          onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
          placeholder="Brief description of the change"
          className="bg-gray-800 border-gray-700 text-white"
          required
        />
      </div>

      <div className="space-y-2">
        <Label className="text-gray-300">Description</Label>
        <Textarea
          value={formData.description}
          onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
          placeholder="Detailed description of the proposed changes..."
          className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
          required
        />
      </div>

      <div className="space-y-2">
        <Label className="text-gray-300">Priority</Label>
        <Select value={formData.priority} onValueChange={v => setFormData(p => ({ ...p, priority: v as 'low' | 'medium' | 'high' | 'urgent' }))}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="low" className="text-white">Low</SelectItem>
            <SelectItem value="medium" className="text-white">Medium</SelectItem>
            <SelectItem value="high" className="text-white">High</SelectItem>
            <SelectItem value="urgent" className="text-white">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full bg-[#00F0FF] hover:bg-[#00D0E0] text-gray-900">
        <Plus className="h-4 w-4 mr-2" />
        Create Change Request
      </Button>
    </form>
  );
};
