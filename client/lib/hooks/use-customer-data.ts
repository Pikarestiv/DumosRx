import { query, insert, generateId } from "@/lib/db/local-database";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  joinDate: string;
  tier: string;
  points: number;
  totalSpent: number;
  lastVisit: string;
  birthday: string;
  status: string;
  outstanding_balance: number;
}

const transformCustomer = (dbData: any): Customer => ({
  id: dbData.id,
  name: `${dbData.first_name} ${dbData.last_name || ""}`.trim(),
  email: dbData.email || "",
  phone: dbData.phone || "",
  address: dbData.address || "",
  joinDate: new Date(dbData.created_at || new Date()).toISOString().split("T")[0],
  tier: "Bronze",
  points: dbData.loyalty_points || 0,
  totalSpent: 0,
  lastVisit: "-",
  birthday: dbData.date_of_birth || "",
  status: dbData.is_active ? "active" : "inactive",
  outstanding_balance: dbData.outstanding_balance || 0,
});

export function useCustomerData() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await query<any>(
        "SELECT * FROM customers WHERE _deleted = 0 ORDER BY created_at DESC"
      );
      const transformed = data.map(transformCustomer);
      setCustomers(transformed);
    } catch (error) {
      console.error("Failed to fetch customers", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const addCustomer = async (payload: any) => {
    try {
      const now = new Date().toISOString();
      const customerId = generateId();
      
      const customerData = {
        id: customerId,
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        date_of_birth: payload.date_of_birth,
        gender: payload.gender,
        allergies: payload.allergies,
        medical_conditions: payload.medical_conditions,
        is_active: 1,
        created_at: now,
        updated_at: now,
      };

      await insert("customers", customerData);
      
      const newCustomer = transformCustomer(customerData);
      setCustomers((prev) => [newCustomer, ...prev]);
      toast.success("Customer added successfully");
      return newCustomer;
    } catch (error: any) {
      console.error("Failed to create customer", error);
      toast.error("Failed to create customer locally");
      throw error;
    }
  };

  return {
    customers,
    loading,
    fetchCustomers,
    addCustomer,
  };
}
