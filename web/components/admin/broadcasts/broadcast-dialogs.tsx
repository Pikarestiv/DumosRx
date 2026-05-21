import { Megaphone, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BroadcastDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  formData: any;
  setFormData: (data: any) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function BroadcastFormFields({ formData, setFormData }: { formData: any, setFormData: (data: any) => void }) {
  return (
    <>
      <div className="space-y-2">
        <Label className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Broadcast Title</Label>
        <Input 
          placeholder="e.g., Scheduled Maintenance" 
          className="rounded-2xl h-12 border-slate-200 dark:border-slate-800 font-bold"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          required
        />
      </div>

      <div className="space-y-2">
        <Label className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Message Content</Label>
        <Textarea 
          placeholder="Tell users what's happening..." 
          className="rounded-2xl border-slate-200 dark:border-slate-800 font-bold min-h-[120px]"
          value={formData.message}
          onChange={(e) => setFormData({...formData, message: e.target.value})}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Alert Type</Label>
          <Select 
            value={formData.type} 
            onValueChange={(val) => setFormData({...formData, type: val})}
          >
            <SelectTrigger className="rounded-2xl h-12 border-slate-200 dark:border-slate-800 font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
              <SelectItem value="info" className="font-bold">Info (Blue)</SelectItem>
              <SelectItem value="warning" className="font-bold text-amber-500">Warning (Amber)</SelectItem>
              <SelectItem value="danger" className="font-bold text-rose-500">Danger (Red)</SelectItem>
              <SelectItem value="success" className="font-bold text-emerald-500">Success (Green)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Expiry Date</Label>
          <Input 
            type="date"
            className="rounded-2xl h-12 border-slate-200 dark:border-slate-800 font-bold"
            value={formData.expires_at}
            onChange={(e) => setFormData({...formData, expires_at: e.target.value})}
          />
        </div>
      </div>
    </>
  );
}

export function CreateBroadcastDialog({
  isOpen,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
}: BroadcastDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-indigo-600 p-8 text-white relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Megaphone className="h-24 w-24" />
          </div>
          <DialogTitle className="text-3xl font-black tracking-tight">New Broadcast</DialogTitle>
          <DialogDescription className="text-indigo-100 font-medium">Create a system-wide alert for all users</DialogDescription>
        </div>
        
        <form onSubmit={onSubmit}>
          <div className="p-8 space-y-6 bg-white dark:bg-slate-900">
            <BroadcastFormFields formData={formData} setFormData={setFormData} />
          </div>
          <DialogFooter className="p-8 pt-0 bg-white dark:bg-slate-900">
            <Button type="button" variant="ghost" className="font-bold rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl h-12 px-8 text-white">Dispatch Broadcast</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditBroadcastDialog({
  isOpen,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
}: BroadcastDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-slate-900 p-8 text-white relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Edit className="h-24 w-24" />
          </div>
          <DialogTitle className="text-3xl font-black tracking-tight">Edit Broadcast</DialogTitle>
          <DialogDescription className="text-slate-400 font-medium">Modify existing broadcast content</DialogDescription>
        </div>
        
        <form onSubmit={onSubmit}>
          <div className="p-8 space-y-6 bg-white dark:bg-slate-900">
            <BroadcastFormFields formData={formData} setFormData={setFormData} />
          </div>
          <DialogFooter className="p-8 pt-0 bg-white dark:bg-slate-900">
            <Button type="button" variant="ghost" className="font-bold rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl h-12 px-8">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
