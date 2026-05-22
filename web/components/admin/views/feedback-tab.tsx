"use client";

import { useState } from "react";
import {
  useAdminFeedback,
  useUpdateFeedbackStatusMutation
} from "@/lib/api/admin-hooks";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Bug, Lightbulb, User, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function FeedbackTab() {
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useAdminFeedback(filter);
  const updateStatus = useUpdateFeedbackStatusMutation();

  const handleUpdateStatus = (id: string, status: string) => {
    updateStatus.mutate({ id, status }, {
      onSuccess: () => toast.success(`Feedback marked as ${status}`),
      onError: () => toast.error("Failed to update status")
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <Bug className="h-4 w-4" />;
      case 'feature_request': return <Lightbulb className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved': return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">Resolved</Badge>;
      case 'dismissed': return <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-200">Dismissed</Badge>;
      default: return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-indigo-600" />
            User Feedback
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Review and manage feedback submitted by DumosRx users across all platforms.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("all")}
            className={filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}
          >
            All
          </Button>
          <Button
            variant={filter === "pending" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("pending")}
            className={filter === "pending" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}
          >
            Pending
          </Button>
          <Button
            variant={filter === "resolved" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFilter("resolved")}
            className={filter === "resolved" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}
          >
            Resolved
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-3xl border-none shadow-sm bg-white dark:bg-slate-900">
              <CardContent className="p-6">
                <Skeleton className="h-24 w-full rounded-2xl" />
              </CardContent>
            </Card>
          ))
        ) : !data?.data?.length ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl shadow-sm">
            <MessageSquare className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">No feedback found</h3>
            <p className="text-sm text-slate-500">There is no feedback matching your filter.</p>
          </div>
        ) : (
          data?.data?.map((item: any) => (
            <Card key={item.id} className="rounded-3xl border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                      {getTypeIcon(item.type)}
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 capitalize flex items-center gap-2">
                        {item.type.replace('_', ' ')}
                        {getStatusBadge(item.status)}
                      </CardTitle>
                      <CardDescription className="text-xs flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.contact_email || "Anonymous"}
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                  {item.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => handleUpdateStatus(item.id, 'resolved')}
                        disabled={updateStatus.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() => handleUpdateStatus(item.id, 'dismissed')}
                        disabled={updateStatus.isPending}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {item.content}
                </p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <span>ID: {item.id}</span>
                  <span>•</span>
                  <span>User ID: {item.user_id}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
