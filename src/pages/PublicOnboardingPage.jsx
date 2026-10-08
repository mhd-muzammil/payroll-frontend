import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Link2Off, Loader2 } from "lucide-react";

import OnboardingForm from "../components/Onboarding/OnboardingForm";
import { onboardingLinkService } from "../services/onboardingLinkService";

/**
 * The form as the person joining sees it.
 *
 * No sidebar, no login, no app around it: somebody opens this on their own
 * phone from a message, fills it in once, and never comes back. So it says
 * what it is at the top, and the three things that can happen -- the link is
 * dead, the form is open, the form is sent -- each get a whole screen rather
 * than a line of red text somewhere.
 *
 * It renders the SAME form the office uses, so the two cannot drift apart. The
 * category comes from the server, never from the URL beyond the token: the
 * link decides which form this is.
 */
const PublicOnboardingPage = () => {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | open | dead | sent
  const [category, setCategory] = useState("Employee");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    onboardingLinkService
      .describe(token)
      .then((data) => {
        if (cancelled) return;
        setCategory(data.category || "Employee");
        setState("open");
      })
      .catch(() => {
        if (!cancelled) setState("dead");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * The same shape the office's page builds, kept here rather than imported:
   * that one also sends the fields only an employer fills in (the review
   * state, the employment status), and this end must not be able to.
   */
  const buildBody = useCallback((formData) => {
    const body = new FormData();
    const put = (name, value) => body.append(name, value ?? "");

    put("employee_name", formData.employeeName);
    put("employee_id", formData.employeeId);
    put("department", formData.department);
    put("designation", formData.designation);
    put("work_location", formData.workLocation);
    if (formData.dateOfJoining) body.append("date_of_joining", formData.dateOfJoining);
    put("mobile_number", formData.mobileNumber);
    put("email_id", formData.emailId);

    if (formData.dob) body.append("dob", formData.dob);
    put("gender", formData.gender);
    put("blood_group", formData.bloodGroup);
    put("address", formData.address);
    put("tshirt_size", formData.tShirtSize);

    put("emergency_contact_name", formData.emergencyName);
    put("emergency_relationship", formData.relationship);
    put("emergency_number", formData.emergencyNumber);

    put("bank_name", formData.bankName);
    put("account_holder_name", formData.accountHolderName);
    put("account_number", formData.accountNumber);
    put("ifsc_code", formData.ifscCode);
    put("bank_branch", formData.bankBranch);
    if (formData.cancelledCheque) body.append("cancelled_cheque", formData.cancelledCheque);

    put("photo_submitted", formData.photoSubmitted);
    put("id_card_blood_group", formData.idCardBloodGroup);

    if (formData.docs.aadhaar) body.append("doc_aadhaar", formData.docs.aadhaar);
    if (formData.docs.pan) body.append("doc_pan", formData.docs.pan);
    if (formData.docs.bankProof) body.append("doc_bank_proof", formData.docs.bankProof);
    if (formData.docs.passportPhoto) body.append("doc_passport_photo", formData.docs.passportPhoto);
    if (formData.docs.educationCert) body.append("doc_education_cert", formData.docs.educationCert);
    if (formData.docs.resume) body.append("doc_resume", formData.docs.resume);
    if (formData.docs.drivingLicense) body.append("doc_driving_license", formData.docs.drivingLicense);

    put("total_experience", formData.totalExperience);
    put("hp_experience", formData.hpExperience);
    put("skills", formData.skills);

    put("company_name", formData.companyName);
    put("gst_number", formData.gstNumber);
    put("contact_person_role", formData.contactPersonRole);
    put("service_type", formData.serviceType);
    put("rate_type", formData.rateType);
    if (formData.rateAmount !== "" && formData.rateAmount !== null && formData.rateAmount !== undefined) {
      body.append("rate_amount", formData.rateAmount);
    }
    if (formData.contractStart) body.append("contract_start", formData.contractStart);
    if (formData.contractEnd) body.append("contract_end", formData.contractEnd);
    if (formData.agreement) body.append("agreement", formData.agreement);

    return body;
  }, []);

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    setError("");
    try {
      await onboardingLinkService.submit(token, buildBody(formData));
      setState("sent");
      window.scrollTo({ top: 0 });
    } catch (err) {
      const detail = err?.response?.data;
      // The server answers with the field it refused; saying which one is the
      // difference between fixing it and giving up on the form.
      const firstProblem =
        detail && typeof detail === "object"
          ? Object.entries(detail)
              .map(([field, messages]) => `${field}: ${[].concat(messages).join(" ")}`)
              .slice(0, 3)
              .join("  ·  ")
          : "";
      setError(
        err?.response?.status === 429
          ? "Too many submissions from this device today. Please try again tomorrow or contact the office."
          : firstProblem || "Could not send the form. Please check your connection and try again.",
      );
      setSubmitting(false);
      window.scrollTo({ top: 0 });
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Opening the form…
      </div>
    );
  }

  if (state === "dead") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <Link2Off className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">This link is no longer open</h1>
          <p className="text-sm text-muted-foreground">
            It may have been replaced since it was sent to you. Ask the office for a new one.
          </p>
        </div>
      </div>
    );
  }

  if (state === "sent") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
          <h1 className="text-2xl font-semibold">Thank you — your form has been sent</h1>
          <p className="text-sm text-muted-foreground">
            The office will check it and get in touch. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Renderways Technology</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Please fill in your details below and press Submit. Everything you send goes
            straight to the office — nobody else can see this page.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <OnboardingForm
          category={category}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
        />
      </div>
    </div>
  );
};

export default PublicOnboardingPage;
