"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Shield, Loader2 } from "lucide-react";
import { getUsers, createUser, deleteUser } from "@/lib/db/local-database";
import { toast } from "sonner";

export function StaffManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    email: "",
    pin: "",
    role: "cashier",
  });

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load staff list");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !formData.pin) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (formData.pin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }

    setIsSubmitting(true);
    try {
      await createUser(formData);
      toast.success("Staff account created successfully");
      setIsDialogOpen(false);
      setFormData({
        name: "",
        username: "",
        email: "",
        pin: "",
        role: "cashier",
      });
      loadUsers();
    } catch (error: any) {
      console.error("Failed to create user:", error);
      if (error.message?.includes("UNIQUE")) {
        toast.error("Username already exists");
      } else {
        toast.error("Failed to create staff account");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (id === "default-admin" || name.toLowerCase() === "admin") {
      toast.error("Default admin cannot be deleted");
      return;
    }

    if (!confirm(`Are you sure you want to delete staff account for ${name}?`)) {
      return;
    }

    try {
      await deleteUser(id);
      toast.success("Staff account deleted");
      loadUsers();
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete staff account");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-serif">Staff Management</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage sub-accounts for your team members.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
              <DialogDescription>
                Create a sub-account with specific permissions.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. John Doe"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    placeholder="johndoe"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        username: e.target.value.toLowerCase(),
                      }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pin">Login PIN *</Label>
                  <Input
                    id="pin"
                    type="password"
                    placeholder="4-digit PIN"
                    maxLength={4}
                    value={formData.pin}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        pin: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">System Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(val) =>
                    setFormData((prev) => ({ ...prev, role: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Cashier (Sales Only)</SelectItem>
                    <SelectItem value="pharmacist">
                      Pharmacist (Inventory & Sales)
                    </SelectItem>
                    <SelectItem value="admin">
                      Admin (Full Access)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No staff members found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{user.username}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role === "admin"
                            ? "default"
                            : user.role === "pharmacist"
                              ? "secondary"
                              : "outline"
                        }
                        className="capitalize"
                      >
                        {user.role === "admin" && (
                          <Shield className="w-3 h-3 mr-1" />
                        )}
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteUser(user.id, user.name)}
                        disabled={user.id === "default-admin" || user.username === "admin"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
