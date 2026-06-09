import { useCallback, useState } from "react";
import { userService } from "../services/userService";
import { extractArray } from "../Utility/apiUtils";

const parseError = (err) => {
  const data = err.response?.data;
  if (!data) return err.message || "Operation failed";
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  const firstKey = Object.keys(data)[0];
  if (firstKey) {
    const value = data[firstKey];
    if (Array.isArray(value) && value.length) return `${firstKey}: ${value[0]}`;
    if (typeof value === "string") return `${firstKey}: ${value}`;
  }
  return "Operation failed";
};

export const useUsers = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const run = async (fn, successMsg) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const result = await fn();
      if (successMsg) setSuccess(successMsg);
      return result;
    } catch (err) {
      setError(parseError(err));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchAll = useCallback(async (params = {}) => {
    const data = await run(() => userService.getAll(params));
    if (typeof data === "string") {
      throw new Error("API returned invalid format (HTML instead of JSON). Check proxy or backend server.");
    }
    const resultList = extractArray(data);
    setRecords(resultList);
    return data;
  }, []);

  const createUser = useCallback(async (payload) => {
    const data = await run(() => userService.create(payload), "User created successfully");
    setRecords((prev) => [data, ...prev]);
    return data;
  }, []);

  const updateUser = useCallback(async (id, payload) => {
    const data = await run(() => userService.update(id, payload), "User updated successfully");
    setRecords((prev) => prev.map((u) => (u.id === id ? data : u)));
    return data;
  }, []);

  const toggleStatus = useCallback(async (id, is_active) => {
    const data = await run(() => userService.patch(id, { is_active }), "User status updated");
    setRecords((prev) => prev.map((u) => (u.id === id ? data : u)));
    return data;
  }, []);

  const deleteUser = useCallback(async (id) => {
    await run(() => userService.delete(id), "User deleted successfully");
    setRecords((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    records,
    loading,
    error,
    success,
    fetchAll,
    createUser,
    updateUser,
    toggleStatus,
    deleteUser,
    clearMessages,
  };
};
