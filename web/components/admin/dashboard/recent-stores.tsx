import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RecentStoresProps {
  recentStores: any[];
  setSelectedStore: (store: any) => void;
}

export function RecentStores({ recentStores, setSelectedStore }: RecentStoresProps) {
  return (
    <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">Recent Stores</h3>
          <p className="text-xs font-medium text-slate-500">Newly registered business instances</p>
        </div>
        <Button variant="ghost" size="sm" className="text-indigo-600 font-bold hover:bg-indigo-50">View All</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800">
              <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6">Store Name</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-400">Owner</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Plan</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Status</TableHead>
              <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right pr-6">Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentStores.map((store: any) => (
              <TableRow 
                key={store.id} 
                className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group cursor-pointer"
                onClick={() => setSelectedStore(store)}
              >
                <TableCell className="pl-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{store.name}</span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{store.id}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-slate-600 dark:text-slate-400">{store.owner}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 font-bold text-[10px]">
                    {store.plan}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${store.status === 'Active' ? 'bg-emerald-500' : store.status === 'Pending' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{store.status}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right pr-6 font-medium text-slate-500 text-sm italic">{store.date}</TableCell>
              </TableRow>
            ))}
            {recentStores.length === 0 && (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-8 text-slate-400 font-medium">No recent registrations found</TableCell>
               </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
