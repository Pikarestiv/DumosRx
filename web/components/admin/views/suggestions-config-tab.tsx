"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, Loader2, Sparkles, Plus, X, Search } from "lucide-react";
import { toast } from "sonner";
import { useSystemConfig, useUpdateSystemConfigMutation } from "@/lib/api/hooks";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SuggestionType = "store_names" | "store_generics" | "store_categories" | "store_manufacturers" | "retail_names" | "retail_categories" | "retail_manufacturers";

export function SuggestionsConfigTab() {
  const { data: serverConfig, isLoading, isError: _isError } = useSystemConfig("global_suggestions");
  const updateMutation = useUpdateSystemConfigMutation();

  const [activeList, setActiveList] = useState<SuggestionType>("store_names");
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState("");

  const [config, setConfig] = useState<any>({
    store: {
      names: [],
      generics: [],
      categories: [],
      manufacturers: [],
      strengths: [],
      dosageForms: []
    },
    retail: {
      names: [],
      categories: [],
      manufacturers: []
    }
  });

  useEffect(() => {
    if (serverConfig) {
      setConfig({
        store: {
          names: serverConfig.store?.names || [],
          generics: serverConfig.store?.generics || [],
          categories: serverConfig.store?.categories || [],
          manufacturers: serverConfig.store?.manufacturers || [],
          strengths: serverConfig.store?.strengths || [],
          dosageForms: serverConfig.store?.dosageForms || []
        },
        retail: {
          names: serverConfig.retail?.names || [],
          categories: serverConfig.retail?.categories || [],
          manufacturers: serverConfig.retail?.manufacturers || []
        }
      });
    }
  }, [serverConfig]);

  const getActiveArray = (): string[] => {
    switch (activeList) {
      case "store_names":
        return config.store.names;
      case "store_generics":
        return config.store.generics;
      case "store_categories":
        return config.store.categories;
      case "store_manufacturers":
        return config.store.manufacturers;
      case "retail_names":
        return config.retail.names;
      case "retail_categories":
        return config.retail.categories;
      case "retail_manufacturers":
        return config.retail.manufacturers;
      default:
        return [];
    }
  };

  const updateActiveArray = (newArr: string[]) => {
    const updated = { ...config };
    switch (activeList) {
      case "store_names":
        updated.store.names = newArr;
        break;
      case "store_generics":
        updated.store.generics = newArr;
        break;
      case "store_categories":
        updated.store.categories = newArr;
        break;
      case "store_manufacturers":
        updated.store.manufacturers = newArr;
        break;
      case "retail_names":
        updated.retail.names = newArr;
        break;
      case "retail_categories":
        updated.retail.categories = newArr;
        break;
      case "retail_manufacturers":
        updated.retail.manufacturers = newArr;
        break;
    }
    setConfig(updated);
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const item = newItem.trim();
    if (!item) return;

    const currentList = getActiveArray();
    if (currentList.includes(item)) {
      toast.error("Item already exists in the list!");
      return;
    }

    const updated = [...currentList, item].sort();
    updateActiveArray(updated);
    setNewItem("");
    toast.success(`Added "${item}"`);
  };

  const handleRemoveItem = (itemToRemove: string) => {
    const currentList = getActiveArray();
    const updated = currentList.filter((item) => item !== itemToRemove);
    updateActiveArray(updated);
    toast.info(`Removed "${itemToRemove}"`);
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ key: "global_suggestions", value: config });
      toast.success("Autocomplete suggestions saved successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to save configuration");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = getActiveArray();
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Autocomplete Suggestions Manager
          </CardTitle>
          <CardDescription>
            Manage dynamic autocomplete suggestions sent to local offline applications. Use tags to quickly add or remove values.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4">
            <Label>Select Suggestion Category</Label>
            <Tabs
              value={activeList}
              onValueChange={(val) => {
                setActiveList(val as SuggestionType);
                setSearchQuery("");
              }}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 h-auto p-1 bg-slate-100 dark:bg-slate-800 gap-1 rounded-xl">
                <TabsTrigger value="store_names" className="text-xs py-2 rounded-lg">Pharm Names</TabsTrigger>
                <TabsTrigger value="store_generics" className="text-xs py-2 rounded-lg">Generics</TabsTrigger>
                <TabsTrigger value="store_categories" className="text-xs py-2 rounded-lg">Pharm Cats</TabsTrigger>
                <TabsTrigger value="store_manufacturers" className="text-xs py-2 rounded-lg">Pharm Mfrs</TabsTrigger>
                <TabsTrigger value="retail_names" className="text-xs py-2 rounded-lg">Retail Names</TabsTrigger>
                <TabsTrigger value="retail_categories" className="text-xs py-2 rounded-lg">Retail Cats</TabsTrigger>
                <TabsTrigger value="retail_manufacturers" className="text-xs py-2 rounded-lg">Retail Mfrs</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mt-4">
            <form onSubmit={handleAddItem} className="space-y-2">
              <Label htmlFor="new-item">Add New Entry</Label>
              <div className="flex gap-2">
                <Input
                  id="new-item"
                  placeholder="Enter new item name..."
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border-accent/20"
                />
                <Button type="submit" variant="secondary" className="px-3">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </form>

            <div className="space-y-2">
              <Label htmlFor="search-items">Search Entries</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-items"
                  placeholder="Filter active list..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-50 dark:bg-slate-900 border-accent/20"
                />
              </div>
            </div>
          </div>

          <div className="border rounded-xl p-4 bg-slate-50 dark:bg-slate-950/40 min-h-[250px] max-h-[400px] overflow-y-auto space-y-2">
            <div className="flex flex-wrap gap-2">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <div
                    key={item}
                    className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-all"
                  >
                    <span>{item}</span>
                    <button
                      onClick={() => handleRemoveItem(item)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="w-full flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2">
                  <Sparkles className="h-8 w-8 opacity-40 animate-pulse text-indigo-500" />
                  <span className="text-sm">No items found matching the search.</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Total entries in this list: <strong className="text-foreground">{items.length}</strong> {searchQuery && `(matching search: ${filteredItems.length})`}
          </div>
        </CardContent>
        <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {updateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Dynamic Suggestions
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
