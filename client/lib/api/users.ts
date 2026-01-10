import api from "./axios";
import { User } from "./common";

export const userApi = {
  getAllStaff: async (): Promise<User[]> => {
    const response = await api.get<User[]>("/staff");
    return response.data;
  },

  createStaff: async (data: Partial<User>): Promise<User> => {
    const response = await api.post<User>("/staff", data);
    return response.data;
  },

  updateStaff: async (id: string, data: Partial<User>): Promise<User> => {
    const response = await api.put<User>(`/staff/${id}`, data);
    return response.data;
  },

  deleteStaff: async (id: string): Promise<void> => {
    await api.delete(`/staff/${id}`);
  },
};
