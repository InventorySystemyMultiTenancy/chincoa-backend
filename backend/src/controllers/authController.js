import { loginUser, registerUser } from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { signToken } from '../utils/jwt.js';
import { requireFields, validateEmail, validatePassword } from '../utils/validators.js';

export async function register(req, res, next) {
  try {
    requireFields(req.body, ['full_name', 'email', 'password']);

    const payload = {
      fullName: req.body.full_name,
      email: req.body.email,
      phone: req.body.phone,
      password: req.body.password,
    };

    validateEmail(payload.email);
    validatePassword(payload.password);

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
    requireFields(req.body, ['email', 'password']);

    validateEmail(req.body.email);

    const user = await loginUser({
      email: req.body.email,
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
    return sendSuccess(res, 200, {
      user: req.user,
    });
  } catch (error) {
    return next(error);
  }
}
