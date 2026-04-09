import { loginUser, registerUser } from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { signToken } from '../utils/jwt.js';
import { getNowByBusinessTimezone, requireFields, validateDate, validateEmail, validatePassword, validatePhone } from '../utils/validators.js';

function isBirthdayToday(birthDate) {
  if (!birthDate) {
    return false;
  }

  const { currentDate } = getNowByBusinessTimezone();
  return String(birthDate).slice(5, 10) === currentDate.slice(5, 10);
}

export async function register(req, res, next) {
  try {
    requireFields(req.body, ['full_name', 'phone', 'password', 'birth_date']);

    const normalizedEmail = req.body.email ? String(req.body.email).trim() : null;

    const payload = {
      fullName: req.body.full_name,
      email: normalizedEmail,
      phone: req.body.phone,
      password: req.body.password,
      birthDate: req.body.birth_date,
    };

    if (normalizedEmail) {
      validateEmail(normalizedEmail);
    }

    validatePhone(payload.phone);
    validatePassword(payload.password);
    validateDate(payload.birthDate);

    const user = await registerUser(payload);
    const token = signToken(user);

    return sendSuccess(res, 201, {
      user,
      token,
    });
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    requireFields(req.body, ['phone', 'password']);
    validatePhone(req.body.phone);

    const user = await loginUser({
      phone: req.body.phone,
      password: req.body.password,
    });

    const token = signToken(user);

    return sendSuccess(res, 200, {
      user,
      token,
    });
  } catch (error) {
    return next(error);
  }
}

export async function me(req, res, next) {
  try {
    const birthdayDiscount = isBirthdayToday(req.user.birth_date)
      ? {
          active: true,
          service_type: 'corte',
          discount_percent: 50,
          message: 'Parabens! Hoje voce tem 50% de desconto no corte.',
        }
      : {
          active: false,
          service_type: 'corte',
          discount_percent: 50,
          message: null,
        };

    return sendSuccess(res, 200, {
      user: req.user,
      birthday_discount: birthdayDiscount,
    });
  } catch (error) {
    return next(error);
  }
}
