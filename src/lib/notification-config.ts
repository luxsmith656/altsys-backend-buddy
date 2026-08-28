export const EMAIL_CONFIG = {
    SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID || "",
    PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "",
    TEMPLATES: {
        OTP: import.meta.env.VITE_EMAILJS_OTP_TEMPLATE || "",
        RESERVATION: import.meta.env.VITE_EMAILJS_RESERVATION_TEMPLATE || "",
    }
};

export const SMS_CONFIG = {
    API_KEY: import.meta.env.VITE_SMS_API_KEY || "",
    BASE_URL: "/api/v1/send/sms"
};
