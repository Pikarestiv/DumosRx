"use client";

import { useEffect, useState } from "react";
import { 
  Megaphone, 
  Plus, 
  Loader2, 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { format } from "date-fns";

export default function AdminBroadcasts() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "info",
    target_type: "all",
    expires_at: "",
    is_active: true
  });

  const fetchBroadcasts = async () => {
    setIsLoading(true);
    try {
      const response = await webApiClient.adminGetBroadcasts();
      console.log("Admin broadcasts response:", response);
      // The API returns { success: true, data: [...] }
      if (response && response.success && Array.isArray(response.data)) {
        setBroadcasts(response.data);
      } else if (Array.isArray(response)) {
        setBroadcasts(response);
      } else {
        console.warn("Unexpected response format:", response);
      }
    } catch (error) {
      console.error("Failed to fetch broadcasts:", error);
      toast.error("Failed to load broadcasts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await webApiClient.createBroadcast(formData);
      toast.success("Broadcast created successfully");
      setIsCreateOpen(false);
      setFormData({
        title: "",
        message: "",
        type: "info",
        target_type: "all",
        expires_at: "",
        is_active: true
      });
      fetchBroadcasts();
    } catch (error) {
      toast.error("Failed to create broadcast");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await webApiClient.updateBroadcast(selectedBroadcast.id, formData);
      toast.success("Broadcast updated successfully");
      setIsEditOpen(false);
      fetchBroadcasts();
    } catch (error) {
      toast.error("Failed to update broadcast");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this broadcast?")) return;
    try {
      await webApiClient.deleteBroadcast(id);
      toast.success("Broadcast deleted");
      fetchBroadcasts();
    } catch (error) {
      toast.error("Failed to delete broadcast");
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await webApiClient.toggleBroadcast(id);
      fetchBroadcasts();
    } catch (error) {
      toast.error("Failed to toggle status");
    }
  };

  const filteredBroadcasts = (Array.isArray(broadcasts) ? broadcasts : []).filter(b => 
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (broadcast: any) => {
    const isExpired = broadcast.expires_at && new Date(broadcast.expires_at) < new Date();
    if (!broadcast.is_active) return <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 font-bold">Inactive</Badge>;
    if (isExpired) return <Badge variant="outline" className="bg-amber-100 text-amber-600 border-amber-200 font-bold">Expired</Badge>;
    return <Badge variant="outline" className="bg-emerald-100 text-emerald-600 border-emerald-200 font-bold">Live</Badge>;
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'danger': return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      default: return <Info className="h-4 w-4 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Broadcast System</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium italic">
            Send global alerts and updates to all connected instances
          </p>
        </div>
        <Button 
          className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20 rounded-2xl h-12"
          onClick={() => {
            setFormData({
              title: "",
              message: "",
              type: "info",
              target_type: "all",
              expires_at: "",
              is_active: true
            });
            setIsCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Broadcast
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search broadcasts..." 
              className="pl-11 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl h-11 focus-visible:ring-indigo-500 font-bold"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl font-bold border-slate-200 dark:border-slate-800">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800">
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6">Content</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Type</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Audience</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Status</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right pr-6">Expiry</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20">
                    <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
                    <p className="text-slate-400 font-bold mt-4 italic">Fetching broadcast logs...</p>
                  </TableCell>
                </TableRow>
              ) : filteredBroadcasts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-slate-400 font-medium">
                    No broadcasts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredBroadcasts.map((broadcast) => (
                  <TableRow key={broadcast.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col max-w-md">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{broadcast.title}</span>
                        <span className="text-xs text-slate-500 truncate">{broadcast.message}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <div className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center`}>
                          {getTypeIcon(broadcast.type)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-indigo-500/10 text-indigo-600 border-none font-bold uppercase text-[10px]">
                        {broadcast.target_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(broadcast)}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {broadcast.expires_at ? format(new Date(broadcast.expires_at), "MMM d, yyyy") : 'Never'}
                        </span>
                        {broadcast.expires_at && (
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">
                            {format(new Date(broadcast.expires_at), "HH:mm")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-200 dark:border-slate-800 p-1">
                          <DropdownMenuItem 
                            className="rounded-lg gap-2 font-bold cursor-pointer"
                            onClick={() => {
                              setSelectedBroadcast(broadcast);
                              setFormData({
                                title: broadcast.title,
                                message: broadcast.message,
                                type: broadcast.type,
                                target_type: broadcast.target_type,
                                expires_at: broadcast.expires_at ? broadcast.expires_at.split('T')[0] : "",
                                is_active: broadcast.is_active
                              });
                              setIsEditOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 text-indigo-500" />
                            Edit Broadcast
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg gap-2 font-bold cursor-pointer"
                            onClick={() => handleToggle(broadcast.id)}
                          >
                            {broadcast.is_active ? (
                              <><XCircle className="h-4 w-4 text-amber-500" /> Deactivate</>
                            ) : (
                              <><CheckCircle className="h-4 w-4 text-emerald-500" /> Activate</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg gap-2 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            onClick={() => handleDelete(broadcast.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Permanent
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-indigo-600 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Megaphone className="h-24 w-24" />
            </div>
            <DialogTitle className="text-3xl font-black tracking-tight">New Broadcast</DialogTitle>
            <DialogDescription className="text-indigo-100 font-medium">Create a system-wide alert for all users</DialogDescription>
          </div>
          
          <form onSubmit={handleCreate}>
            <div className="p-8 space-y-6 bg-white dark:bg-slate-900">
              <div className="space-y-2">
                <Label htmlFor="title" className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Broadcast Title</Label>
                <Input 
                  id="title" 
                  placeholder="e.g., Scheduled Maintenance" 
                  className="rounded-2xl h-12 border-slate-200 dark:border-slate-800 font-bold"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Message Content</Label>
                <Textarea 
                  id="message" 
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
            </div>

            <DialogFooter className="p-8 pt-0 bg-white dark:bg-slate-900">
              <Button type="button" variant="ghost" className="font-bold rounded-xl" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl h-12 px-8">Dispatch Broadcast</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-slate-900 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Edit className="h-24 w-24" />
            </div>
            <DialogTitle className="text-3xl font-black tracking-tight">Edit Broadcast</DialogTitle>
            <DialogDescription className="text-slate-400 font-medium">Modify existing broadcast content</DialogDescription>
          </div>
          
          <form onSubmit={handleUpdate}>
            <div className="p-8 space-y-6 bg-white dark:bg-slate-900">
              <div className="space-y-2">
                <Label htmlFor="edit-title" className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Broadcast Title</Label>
                <Input 
                  id="edit-title" 
                  className="rounded-2xl h-12 border-slate-200 dark:border-slate-800 font-bold"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-message" className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1">Message Content</Label>
                <Textarea 
                  id="edit-message" 
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
            </div>

            <DialogFooter className="p-8 pt-0 bg-white dark:bg-slate-900">
              <Button type="button" variant="ghost" className="font-bold rounded-xl" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl h-12 px-8">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
