import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { User, Contact, Building2, CreditCard, FileCheck, BadgePlus } from "lucide-react";

const OnboardingForm = ({ onSubmit, onCancel, isSubmitting = false, initialData = null }) => {
  const isEditing = Boolean(initialData);

  // Map a backend record (snake_case) onto the form's camelCase fields. Files
  // are left null: existing uploads are kept unless the operator picks new ones.
  const buildInitialState = (rec) => ({
    // 1. Basic Details
    employeeName: rec?.employee_name || "",
    employeeId: rec?.employee_id || "",
    department: rec?.department || "",
    designation: rec?.designation || "",
    workLocation: rec?.work_location || "",
    dateOfJoining: rec?.date_of_joining || "",
    mobileNumber: rec?.mobile_number || "",
    emailId: rec?.email_id || "",
    // 2. Personal Details
    dob: rec?.dob || "",
    gender: rec?.gender || "",
    bloodGroup: rec?.blood_group || "",
    address: rec?.address || "",
    tShirtSize: rec?.tshirt_size || "",
    // 3. Emergency Contact
    emergencyName: rec?.emergency_contact_name || "",
    relationship: rec?.emergency_relationship || "",
    emergencyNumber: rec?.emergency_number || "",
    // 4. Bank Details
    bankName: rec?.bank_name || "",
    accountHolderName: rec?.account_holder_name || "",
    accountNumber: rec?.account_number || "",
    ifscCode: rec?.ifsc_code || "",
    bankBranch: rec?.bank_branch || "",
    cancelledCheque: null,
    // 5. ID Card Details
    photoSubmitted: rec?.photo_submitted || "",
    idCardBloodGroup: rec?.id_card_blood_group || "",
    // 6. Documents Submitted (files re-uploaded only if changed)
    docs: {
      aadhaar: null,
      pan: null,
      bankProof: null,
      passportPhoto: null,
      educationCert: null,
      resume: null,
      drivingLicense: null,
    },
    // 7. Additional Info
    totalExperience: rec?.total_experience || "",
    hpExperience: rec?.hp_experience || "",
    skills: rec?.skills || "", // pc, printer, both
  });

  const [formData, setFormData] = useState(() => buildInitialState(initialData));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDocFileChange = (name, file) => {
    setFormData((prev) => ({
      ...prev,
      docs: { ...prev.docs, [name]: file }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit(formData);
    }
  };

  const inputStyle = "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200";
  const labelStyle = "block text-sm font-medium text-muted-foreground mb-1.5";

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{isEditing ? "Edit Onboarding Details" : "Employee Onboarding Form"}</h1>
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? "Update the information below. Existing documents stay unless you upload new ones."
              : "Complete the information form to onboard a new employee."}
          </p>
        </div>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Back to List
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Details */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">1. Employee Basic Details</h3>
              <p className="text-xs text-muted-foreground">Essential identification and joining info</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelStyle}>Employee Name</label>
              <input type="text" name="employeeName" value={formData.employeeName} onChange={handleChange} className={inputStyle} required placeholder="Full Name" />
            </div>
            <div>
              <label className={labelStyle}>Employee ID (If assigned)</label>
              <input type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} className={inputStyle} placeholder="Optional" />
            </div>
            <div>
              <label className={labelStyle}>Department</label>
              <input type="text" name="department" value={formData.department} onChange={handleChange} className={inputStyle} required placeholder="IT, HR, Admin etc." />
            </div>
            <div>
              <label className={labelStyle}>Designation</label>
              <input type="text" name="designation" value={formData.designation} onChange={handleChange} className={inputStyle} required placeholder="Job Title" />
            </div>
            <div>
              <label className={labelStyle}>Work Location on / Branch</label>
              <input type="text" name="workLocation" value={formData.workLocation} onChange={handleChange} className={inputStyle} required placeholder="Location" />
            </div>
            <div>
              <label className={labelStyle}>Date of Joining</label>
              <input type="date" name="dateOfJoining" value={formData.dateOfJoining} onChange={handleChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Mobile Number</label>
              <input type="tel" name="mobileNumber" value={formData.mobileNumber} onChange={handleChange} className={inputStyle} required placeholder="Phone" />
            </div>
            <div>
              <label className={labelStyle}>Email ID</label>
              <input type="email" name="emailId" value={formData.emailId} onChange={handleChange} className={inputStyle} required placeholder="Work/Personal email" />
            </div>
          </div>
        </Card>

        {/* Section 2: Personal Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center shrink-0">
                <Contact className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">2. Personal Details</h3>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelStyle}>Date of Birth</label>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} className={inputStyle} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelStyle}>Gender</label>
                  <select name="gender" value={formData.gender} onChange={handleChange} className={inputStyle} required>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Blood Group</label>
                  <input type="text" name="bloodGroup" value={formData.bloodGroup} onChange={handleChange} className={inputStyle} placeholder="e.g. O+" />
                </div>
              </div>
              <div>
                <label className={labelStyle}>Address</label>
                <textarea name="address" rows={2} value={formData.address} onChange={handleChange} className={inputStyle} placeholder="Full address" required />
              </div>
              <div>
                <label className={labelStyle}>T-shirt size</label>
                <select name="tShirtSize" value={formData.tShirtSize} onChange={handleChange} className={inputStyle}>
                  <option value="">Select Size</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center shrink-0">
                <Contact className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">3. Emergency Contact</h3>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelStyle}>Contact Person Name</label>
                <input type="text" name="emergencyName" value={formData.emergencyName} onChange={handleChange} className={inputStyle} required />
              </div>
              <div>
                <label className={labelStyle}>Relationship</label>
                <input type="text" name="relationship" value={formData.relationship} onChange={handleChange} className={inputStyle} required />
              </div>
              <div>
                <label className={labelStyle}>Contact Number</label>
                <input type="tel" name="emergencyNumber" value={formData.emergencyNumber} onChange={handleChange} className={inputStyle} required />
              </div>
            </div>
          </Card>
        </div>

        {/* Section 4: Bank Details */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">4. Bank Account Details (For Salary)</h3>
              <p className="text-xs text-muted-foreground">Enter accurate information for payroll processes</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className={labelStyle}>Bank Name</label>
              <input type="text" name="bankName" value={formData.bankName} onChange={handleChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Account Holder Name</label>
              <input type="text" name="accountHolderName" value={formData.accountHolderName} onChange={handleChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Account Number</label>
              <input type="text" name="accountNumber" value={formData.accountNumber} onChange={handleChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>IFSC Code</label>
              <input type="text" name="ifscCode" value={formData.ifscCode} onChange={handleChange} className={inputStyle} required />
            </div>
            <div>
              <label className={labelStyle}>Branch</label>
              <input type="text" name="bankBranch" value={formData.bankBranch} onChange={handleChange} className={inputStyle} required />
            </div>
            <div className="flex flex-col justify-end">
               <span className="text-xs italic text-muted-foreground mb-3">(Attach cancelled cheque / bank passbook copy)</span>
               <input 
                 type="file" 
                 onChange={(e) => setFormData(prev => ({ ...prev, cancelledCheque: e.target.files[0] }))}
                 className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
               />
               {formData.cancelledCheque && (
                 <span className="text-[10px] text-emerald-600 mt-1.5 truncate max-w-[200px]" title={formData.cancelledCheque.name}>
                   ✓ {formData.cancelledCheque.name}
                 </span>
               )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Section 5: ID Card Details */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">5. ID Card Details</h3>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelStyle}>Photo Submitted</label>
                <div className="flex gap-4 mt-2">
                  <label className="inline-flex items-center">
                    <input type="radio" name="photoSubmitted" value="Yes" checked={formData.photoSubmitted === "Yes"} onChange={handleChange} className="w-4 h-4 text-primary border-gray-300 focus:ring-primary" />
                    <span className="ml-2 text-sm">Yes</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input type="radio" name="photoSubmitted" value="No" checked={formData.photoSubmitted === "No"} onChange={handleChange} className="w-4 h-4 text-primary border-gray-300 focus:ring-primary" />
                    <span className="ml-2 text-sm">No</span>
                  </label>
                </div>
              </div>
              <div>
                <label className={labelStyle}>Blood Group Mention for ID Card</label>
                <input type="text" name="idCardBloodGroup" value={formData.idCardBloodGroup} onChange={handleChange} className={inputStyle} placeholder="e.g. B+ positive" />
              </div>
            </div>
          </Card>

          {/* Section 6: Documents Submitted */}
          <Card className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 flex items-center justify-center shrink-0">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">6. Documents Submitted</h3>
                <p className="text-xs text-muted-foreground">Upload scanned copies / soft copies</p>
              </div>
            </div>
            <div className="space-y-3.5 mt-1 max-h-[350px] overflow-y-auto pr-2">
              {[
                { key: "aadhaar", label: "Aadhaar Card Copy" },
                { key: "pan", label: "PAN Card Copy" },
                { key: "bankProof", label: "Bank Proof" },
                { key: "passportPhoto", label: "Passport Size Photo" },
                { key: "educationCert", label: "Educational Certificates" },
                { key: "resume", label: "Resume Copy" },
                { key: "drivingLicense", label: "Driving License" },
              ].map((doc) => (
                <div key={doc.key} className="flex flex-col gap-1 p-2.5 rounded-xl border border-border bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{doc.label}</span>
                    {formData.docs[doc.key] && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 flex items-center gap-0.5 font-medium">
                         ✓ Selected
                      </span>
                    )}
                  </div>
                  <input 
                    type="file" 
                    onChange={(e) => handleDocFileChange(doc.key, e.target.files[0])} 
                    className="text-[11px] text-slate-500 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-teal-100/80 file:text-teal-700 dark:file:bg-teal-900 dark:file:text-teal-300 hover:file:bg-teal-200 dark:hover:file:bg-teal-800 cursor-pointer w-full" 
                  />
                  {formData.docs[doc.key] && (
                    <div className="text-[9px] text-muted-foreground truncate font-mono mt-0.5 pl-1">
                      {formData.docs[doc.key].name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Section 7,8,9: Professional Details & Skills */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center shrink-0">
              <BadgePlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Professional & Skills</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelStyle}>7. Total work experience</label>
              <input type="text" name="totalExperience" value={formData.totalExperience} onChange={handleChange} className={inputStyle} placeholder="Years/Months" />
            </div>
            <div>
              <label className={labelStyle}>8. HP experience</label>
              <input type="text" name="hpExperience" value={formData.hpExperience} onChange={handleChange} className={inputStyle} placeholder="If any" />
            </div>
            <div>
              <label className={labelStyle}>9. Skills</label>
              <div className="flex flex-wrap gap-4 mt-2 pt-1.5">
                <label className="inline-flex items-center">
                  <input type="radio" name="skills" value="pc" checked={formData.skills === "pc"} onChange={handleChange} className="h-4 w-4 text-primary" />
                  <span className="ml-2 text-sm">PC</span>
                </label>
                <label className="inline-flex items-center">
                  <input type="radio" name="skills" value="printer" checked={formData.skills === "printer"} onChange={handleChange} className="h-4 w-4 text-primary" />
                  <span className="ml-2 text-sm">Printer</span>
                </label>
                <label className="inline-flex items-center">
                  <input type="radio" name="skills" value="both" checked={formData.skills === "both"} onChange={handleChange} className="h-4 w-4 text-primary" />
                  <span className="ml-2 text-sm">Both</span>
                </label>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-4 pt-4">
          <Button type="button" variant="outline" size="lg" onClick={onCancel} className="rounded-2xl h-12 px-6 font-medium">
            Cancel
          </Button>
          <Button type="submit" variant="brand" size="lg" disabled={isSubmitting} className="rounded-2xl h-12 px-10 shadow-lg shadow-primary/20 font-semibold">
            {isSubmitting
              ? (isEditing ? "Updating..." : "Submitting...")
              : (isEditing ? "Update Onboarding" : "Submit Onboarding Form")}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default OnboardingForm;
