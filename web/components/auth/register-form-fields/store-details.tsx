import { UseFormReturn } from "react-hook-form";
import { Building } from "lucide-react";
import { motion } from "framer-motion";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface StoreDetailsProps {
  form: UseFormReturn<any>;
  itemVariant: any;
}

export function StoreDetails({ form, itemVariant }: StoreDetailsProps) {
  return (
    <>
      <motion.div variants={itemVariant}>
        <FormField
          control={form.control}
          name="store_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-gray-300">
                Store / Store Name
              </FormLabel>
              <FormControl>
                <div className="relative group">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Dumos Store"
                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 h-11"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      </motion.div>

      <motion.div variants={itemVariant}>
        <FormField
          control={form.control}
          name="store_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-gray-300">Store Type</FormLabel>
              <FormControl>
                <select
                  className="flex h-11 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-primary/50 focus:ring-primary/20 focus:outline-none transition-colors"
                  {...field}
                >
                  <option value="pharmacy" className="text-gray-900">
                    Pharmacy
                  </option>
                  <option value="supermarket" className="text-gray-900">
                    Supermarket
                  </option>
                  <option value="grocery" className="text-gray-900">
                    Grocery
                  </option>
                  <option value="general" className="text-gray-900">
                    General Store
                  </option>
                </select>
              </FormControl>
              <FormMessage className="text-xs text-red-400" />
            </FormItem>
          )}
        />
      </motion.div>
    </>
  );
}
