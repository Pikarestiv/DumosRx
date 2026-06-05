import { Store, Users, Calendar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

interface StoreDialogProps {
  selectedStore: any;
  setSelectedStore: (store: any) => void;
}

export function StoreDialog({ selectedStore, setSelectedStore }: StoreDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={!!selectedStore} onOpenChange={() => setSelectedStore(null)}>
      <DialogContent className="max-w-2xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
        {selectedStore && (
          <div className="bg-white dark:bg-slate-900">
            <div className="bg-indigo-600 p-8 text-white relative">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <Store className="h-24 w-24" />
              </div>
              <Badge className="bg-white/20 text-white border-none mb-4 font-bold">{selectedStore.plan} Partner</Badge>
              <DialogTitle className="text-3xl font-black tracking-tight">{selectedStore.name}</DialogTitle>
              <p className="text-indigo-100 font-medium mt-1 uppercase text-xs tracking-widest">ID: {selectedStore.id}</p>
            </div>
            
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Store Owner</p>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-500" />
                    <p className="font-bold text-slate-900 dark:text-white">{selectedStore.owner}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registration Date</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-indigo-500" />
                    <p className="font-bold text-slate-900 dark:text-white">{selectedStore.date}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${selectedStore.status === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <p className="font-bold text-slate-900 dark:text-white">{selectedStore.status}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact Hash</p>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-indigo-500" />
                    <p className="font-mono text-xs font-bold text-slate-500">SEC-OP-{selectedStore.id.substring(0, 6)}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                <Button 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl h-12"
                  onClick={() => {
                    router.push(`/admin/stores?search=${selectedStore.id}`);
                    setSelectedStore(null);
                  }}
                >
                  View Full Profile
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 font-bold rounded-xl h-12 border-slate-200"
                  onClick={() => setSelectedStore(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
