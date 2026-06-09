import { useCallback, useState } from "react";
import { employeeService } from "../services/employeeService";
import { extractArray } from "../Utility/apiUtils";

export const useEmployee = () => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const parseErrorMessage = (err) => {
        const data = err.response?.data;
        if (!data) return err.message || "Operation failed";
        if (typeof data === "string") return data;
        if (data.detail) return data.detail;
        if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
            return data.non_field_errors[0];
        }
        const firstKey = Object.keys(data)[0];
        if (firstKey) {
            const value = data[firstKey];
            if (Array.isArray(value) && value.length) return `${firstKey}: ${value[0]}`;
            if (typeof value === "string") return `${firstKey}: ${value}`;
        }
        return "Operation failed";
    };

    const handleRequest = async (requestFn, successMsg) => {
        try {
            setLoading(true);
            setError(null);
            setSuccess(null);
            const result = await requestFn();
            if (successMsg) setSuccess(successMsg);
            return result;
        }
        catch (err) {
            const message = parseErrorMessage(err);
            setError(message);
            throw err;
        }
        finally {
            setLoading(false);
        }
    };

    const fetchAll = useCallback(async (params = {}) => {
    const data = await handleRequest(() => employeeService.getAll(params));
    if (typeof data === "string") {
      throw new Error("API returned invalid format (HTML instead of JSON). Check proxy or backend server.");
    }
    const resultList = extractArray(data);
    setRecords(resultList);
    return data;
  }, []);

    const createRecord = useCallback(async (employeeData) => {
        const data = await handleRequest(() => employeeService.create(employeeData), "Employee record created successfully");
        if (data) setRecords(prev => [...prev, data]);
        return data;
    },[]);

    const updateRecord = useCallback(async (id, employeeData) => {
        const data = await handleRequest(() => employeeService.update(id, employeeData), "Employee record updated successfully");
        if (data) setRecords(prev => prev.map(r => r.id === id ? data : r));
        return data;
    },[]);

    const patchRecord = useCallback(async (id, partialData) => {
        const data = await handleRequest(() => employeeService.patch(id, partialData), "Employee record updated successfully");
        if (data) setRecords(prev => prev.map(r => r.id === id ? data : r));
        return data;
    },[]);

    const deleteRecord = useCallback(async (id) => {
        await handleRequest(() => employeeService.delete(id), "Employee record deleted successfully");
        setRecords(prev => prev.filter(r => r.id !== id));
    },[]);

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
        createRecord,
        updateRecord,
        patchRecord,
        deleteRecord,
        clearMessages,
        setRecords,
    };

};
