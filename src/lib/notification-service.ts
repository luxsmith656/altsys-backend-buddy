import emailjs from '@emailjs/browser';
import { EMAIL_CONFIG, SMS_CONFIG } from './notification-config';
import { supabase } from '@/integrations/supabase/client';

/**
 * Send SMS using the custom SMS API bridge.
 */
export const sendSms = async (phone: string, message: string) => {
    try {
        const formattedPhone = phone.startsWith('0') ? '63' + phone.slice(1) : phone;
        const response = await fetch(SMS_CONFIG.BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': SMS_CONFIG.API_KEY
            },
            body: JSON.stringify({
                recipient: formattedPhone,
                message: message
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
            return { success: false, error: data.error || 'Failed to send SMS' };
        }
        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

/**
 * Send OTP through the server-side Resend bridge. EmailJS remains a
 * compatibility fallback for deployments where the function is not deployed.
 */
export const sendOtpEmail = async (email: string, name: string, otp: string) => {
    let resendError = 'Email delivery is not configured';
    try {
        const { data, error } = await supabase.functions.invoke('send-email-otp', {
            body: { email: email.trim().toLowerCase(), name: name.trim() },
        });

        if (!error && data?.success === true && typeof data.challengeId === 'string') {
            return { success: true, challengeId: data.challengeId };
        }
        resendError = error?.message || data?.error || resendError;
    } catch (error: any) {
        resendError = error.message || resendError;
    }

    if (!EMAIL_CONFIG.SERVICE_ID || !EMAIL_CONFIG.TEMPLATES.OTP || !EMAIL_CONFIG.PUBLIC_KEY) {
        return { success: false, error: resendError };
    }

    try {
        await emailjs.send(
            EMAIL_CONFIG.SERVICE_ID,
            EMAIL_CONFIG.TEMPLATES.OTP,
            {
                to_name: name,
                to_email: email, 
                otp_code: otp,
                app_name: "Mt. Kasilungan",
                year: new Date().getFullYear()
            },
            EMAIL_CONFIG.PUBLIC_KEY
        );

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.text || error.message || resendError };
    }
};

/**
 * Verify an email OTP without exposing the generated code to the browser.
 */
export const verifyOtpEmail = async (email: string, challengeId: string, otp: string) => {
    try {
        const { data, error } = await supabase.functions.invoke('verify-email-otp', {
            body: { email: email.trim().toLowerCase(), challengeId, otp },
        });
        if (error) return { success: false, error: error.message };
        if (data?.success === true) return { success: true };
        return { success: false, error: data?.error || 'Invalid verification code' };
    } catch (error: any) {
        return { success: false, error: error.message || 'Email verification failed' };
    }
};

/**
 * Send Reservation Confirmation via EmailJS.
 */
export const sendReservationEmail = async (data: { 
    visitor_name: string, 
    visitor_email: string, 
    booking_id: string, 
    hike_date: string, 
    trail_name: string, 
    checkin_time: string 
}) => {
    try {
        await emailjs.send(
            EMAIL_CONFIG.SERVICE_ID,
            EMAIL_CONFIG.TEMPLATES.RESERVATION,
            {
                visitor_name: data.visitor_name,
                visitor_email: data.visitor_email,
                booking_id: data.booking_id,
                hike_date: data.hike_date,
                trail_name: data.trail_name,
                checkin_time: data.checkin_time,
                app_name: "Mt. Kasilungan"
            },
            EMAIL_CONFIG.PUBLIC_KEY
        );

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.text || error.message };
    }
};

/**
 * Comprehensive Multi-Channel Reservation Confirmation.
 */
export const confirmReservation = async (reservation: {
    id: string,
    visitorName: string,
    email: string,
    phone: string,
    hikeDate: string,
    trail: string,
    hikeTime: string
}) => {
    const emailPromise = sendReservationEmail({
        visitor_name: reservation.visitorName,
        visitor_email: reservation.email,
        booking_id: reservation.id,
        hike_date: reservation.hikeDate,
        trail_name: reservation.trail,
        checkin_time: reservation.hikeTime
    });

    const smsPromise = sendSms(
        reservation.phone,
        `Mt. Kasilungan: Your reservation #${reservation.id} for ${reservation.hikeDate} is CONFIRMED! See you there!`
    );

    const [emailResult, smsResult] = await Promise.all([emailPromise, smsPromise]);

    return {
        email: emailResult.success,
        sms: smsResult.success,
        errors: {
            email: emailResult.error,
            sms: smsResult.error
        }
    };
};
