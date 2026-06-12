// hooks/useAttendance.js
import { useState, useCallback } from "react";
import { attendanceService } from "../services/attendanceService";
import { extractArray } from "../Utility/apiUtils";

export const useAttendance = () => {
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
      const val = data[firstKey];
      if (Array.isArray(val) && val.length) return `${firstKey}: ${val[0]}`;
      if (typeof val === "string") return `${firstKey}: ${val}`;
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
    } catch (err) {
      const message = parseErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchAll = useCallback(async (params = {}) => {
    const data = await handleRequest(
      () => attendanceService.getAll(params)
    );
    if (typeof data === "string") {
      throw new Error("API returned invalid format (HTML instead of JSON). Check proxy or backend server.");
    }
    const resultList = extractArray(data);
    setRecords(resultList);
    return data;
  }, []);

  const createRecord = useCallback(async (attendanceData) => {
    const data = await handleRequest(
      () => attendanceService.create(attendanceData),
      "Attendance record created successfully"
    );
    if (data) {
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.id === data.id);
        if (idx === -1) return [...prev, data];
        return prev.map((r) => (r.id === data.id ? data : r));
      });
    }
    return data;
  }, []);

  const updateRecord = useCallback(async (id, attendanceData) => {
    const data = await handleRequest(
      () => attendanceService.update(id, attendanceData),
      "Attendance record updated successfully"
    );
    if (data) {
      setRecords((prev) => prev.map((r) => (r.id === id ? data : r)));
    }
    return data;
  }, []);

  const patchRecord = useCallback(async (id, partialData) => {
    const data = await handleRequest(
      () => attendanceService.patch(id, partialData),
      "Attendance record updated successfully"
    );
    if (data) {
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...data } : r))
      );
    }
    return data;
  }, []);

  const deleteRecord = useCallback(async (id) => {
    await handleRequest(
      () => attendanceService.delete(id),
      "Attendance record deleted successfully"
    );
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const bulkCreate = useCallback(async (attendanceArray) => {
    const data = await handleRequest(
      () => attendanceService.bulkCreate(attendanceArray),
      "Bulk attendance records created successfully"
    );
    if (data) {
      setRecords((prev) => [...prev, ...data]);
    }
    return data;
  }, []);

  const checkInGeo = useCallback(async (geoData) => {
    const data = await handleRequest(
      () => attendanceService.checkIn(geoData),
      "Successfully punched in! Distance verified."
    );
    if (data) {
      setRecords((prev) => [data, ...prev]);
    }
    return data;
  }, []);

  const checkOutGeo = useCallback(async (geoData) => {
    const data = await handleRequest(
      () => attendanceService.checkOut(geoData),
      "Successfully punched out! Distance verified."
    );
    if (data) {
      setRecords((prev) => prev.map((r) => (r.id === data.id ? data : r)));
    }
    return data;
  }, []);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const importSheet = useCallback(async (file) => {
    const data = await handleRequest(
      () => attendanceService.importSheet(file),
      "Attendance sheet imported successfully"
    );
    fetchAll();
    return data;
  }, [fetchAll]);

  const deleteAllRecords = useCallback(async () => {
    const data = await handleRequest(
      () => attendanceService.deleteAll(),
      "All attendance records deleted successfully"
    );
    setRecords([]);
    return data;
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
    bulkCreate,
    importSheet,
    deleteAllRecords,
    checkInGeo,
    checkOutGeo,
    clearMessages,
    setRecords,
  };
};
