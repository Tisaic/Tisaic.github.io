function MASTER_identification_linear

% Identify the parameters of an industrial robot using a linear state space
% model. Addionally, identifiy the parameters of a linear inverse model.

% Inputs: none
% Outputs: none
% Can run stand-alone.

% Jonas Weigand
% TU Kaiserslautern
% jonas.weigand@mv.uni-kl.de


addpath('visualization_functions', 'saved_linear_model')
beep off
close all
clc


%% ------------------------------------------------------------------------
%  ------------- SETTINGS -------------------------------------------------
%  ------------------------------------------------------------------------

% number of joints to plot, integer from 1 to 6
n_axis_plot                 = 6;

% plot the raw input and target (meausred not simulated) data
enable_plot_data            = true;

% enable a new identification or load pre-trained models
enable_new_identification   = false;

% switch from forward to inverse model
enable_inverse_model        = true;

% force the model input to start at zero, both test and training
enable_zero_input           = true;

% switch from prediction to simulation mode
enable_simulation_mode      = true;







%% ------------------------------------------------------------------------
%  ------------- CHECK SETTINGS CONSITENCY --------------------------------
%  ------------------------------------------------------------------------



% always set for the inverse model
if enable_inverse_model
    if enable_simulation_mode || enable_zero_input
        warning('Disable settings for inverse model.')
    end
    enable_simulation_mode      = false;
    enable_zero_input           = false;
end






%% ------------------------------------------------------------------------
%  ------------- LOAD RECORDED DATA ---------------------------------------
%  ------------------------------------------------------------------------



if enable_inverse_model
    trajectory_name     = 'inverse_identification_without_raw_data.mat';
else
    trajectory_name     = 'forward_identification_without_raw_data.mat';
end



data                = load(trajectory_name);
u_train             = data.u_train;
y_train             = data.y_train;
u_test              = data.u_test;
y_test              = data.y_test;
time_train          = data.time_train;
time_test           = data.time_test;


if enable_plot_data && ~enable_inverse_model
    
    q1 = timeseries(y_train(1,:), time_train);
    q2 = timeseries(y_train(2,:), time_train);
    q3 = timeseries(y_train(3,:), time_train);
    q4 = timeseries(y_train(4,:), time_train);
    q5 = timeseries(y_train(5,:), time_train);
    q6 = timeseries(y_train(6,:), time_train);
    
    u1 = timeseries(u_train(1,:), time_train);
    u2 = timeseries(u_train(2,:), time_train);
    u3 = timeseries(u_train(3,:), time_train);
    u4 = timeseries(u_train(4,:), time_train);
    u5 = timeseries(u_train(5,:), time_train);
    u6 = timeseries(u_train(6,:), time_train);
    
    % use the signal analyzer tool
    % signalAnalyzer(q1, q2, q3, q4, q5, q6);
    % signalAnalyzer(u1, u2, u3, u4, u5, u6);
    
    % use adjusted visualization functions created by the signal analyzer
    % tool
    input_spectrum(u1, u2, u3, u4, u5, u6);
    output_spectrum(q1, q2, q3, q4, q5, q6);
end

% set initial values to zero
if enable_zero_input
    u_train   = u_train - u_train(:,1);
    u_test    = u_test - u_test(:,1);
end


%% ------------------------------------------------------------------------
%  ------------- PARAMETER IDENTIFICATION ---------------------------------
%  ------------------------------------------------------------------------



if enable_new_identification
    
    U   = u_train;
    Y   = y_train;
    dt  = time_train(2) - time_train(1);
    id_data     = iddata(Y', U', dt);
    
    if enable_inverse_model
        
        opt_fmincon                         = optimoptions('fmincon');
        opt_fmincon.Display                 = 'iter';
        opt_fmincon.MaxFunctionEvaluations  = 1e4;
        opt_fmincon.MaxIterations           = 1e3;
        
        n_outputs               = size(y_train, 1);
        n_inputs                = size(u_train, 1);
        inverse_lin_model       = zeros(n_outputs, n_inputs);
        n_opt                   = numel(inverse_lin_model);
        x0                      = randn(n_opt, 1);
        
        [x_sol, ~] = fmincon(@cost_fun_inverse_lin_model, x0,[],[],[],[],[],[],[],opt_fmincon);
        
        inverse_lin_model(:) = x_sol;
        save('saved_linear_model/trained_model.mat', 'inverse_lin_model', '-append')
        
    else
        
        n_states                = 12;
        opt_ssest               = ssestOptions();
        opt_ssest.Display       = 'on';
        
        if enable_simulation_mode
            
            opt_ssest.Focus             = 'simulation';
            forward_ss_model_sim        = ssest(id_data, n_states, opt_ssest);
            
            save('saved_linear_model/trained_model.mat', 'forward_ss_model_sim', '-append')
            
        elseif  ~enable_simulation_mode
            
            % enforce canonical form to apply initial states in prediction
            opt_ssest.Focus             = 'prediction';
            forward_ss_model_pred       = ssest(id_data, n_states, 'Form', 'canonical', opt_ssest);
            
            save('saved_linear_model/trained_model.mat', 'forward_ss_model_pred', '-append')
            
        end
    end
end

% nested cost function
    function cost = cost_fun_inverse_lin_model(x)
        
        % transform to matrix
        inverse_lin_model(:) = x;
        
        % compute the error
        error = (y_train - inverse_lin_model * u_train);
        
        % compute sum of squared errors
        cost = sum(error.^2, 'all');
        
    end


loaded_model    = load('saved_linear_model/trained_model.mat');

if enable_inverse_model
    inverse_lin_model   = loaded_model.inverse_lin_model;
    
elseif ~enable_inverse_model && enable_simulation_mode
    robot_model = loaded_model.forward_ss_model_sim;
    
elseif ~enable_inverse_model && ~enable_simulation_mode
    robot_model = loaded_model.forward_ss_model_pred;
    
end








%% ------------------------------------------------------------------------
%  ----------------------------- PLOT -------------------------------------
%  ------------------------------------------------------------------------

nrmse_pos_all_axis = zeros(n_axis_plot, 2);
r_squared_all_axis = zeros(n_axis_plot, 2);

% for training and test
for k1 = 1:2
    
    
    
    % per definition, case 1 is training
    if k1 == 1
        y_true      = y_train;
        u_true      = u_train;
        time_true   = time_train;
        n_step_plot = 10; % reduce data size
        disp('Training data.')
    else
        y_true      = y_test;
        u_true      = u_test;
        time_true   = time_test;
        n_step_plot = 2; % reduce data size
        disp('Test data.')
    end
    
    % simulate model
    if enable_inverse_model
        y_sim = inverse_lin_model * u_true;
        
    elseif ~enable_inverse_model && enable_simulation_mode
        y_sim           = lsim(robot_model, u_true, time_true)';
        
    elseif ~enable_inverse_model && ~enable_simulation_mode
        
        y_sim           = zeros(size(y_true));
        n_output        = size(y_true, 1);
        x0              = zeros(2 * n_output, 1);
        y_sim(:,1)      = y_true(:,1);
        n_time          = size(y_true, 2);
        dt              = time_true(2) - time_true(1);
        
        for k_time = 2:n_time
            
            x0(1:2:end)      = y_true(:, k_time); % only implement one state, omit velocity
            y_out            = lsim(robot_model, u_true(:, k_time-1:k_time), [0, dt], x0)';
            y_sim(:, k_time) = y_out(:, end);
            
        end
    end
    
    % plot raw training and test data
    figure;
    for k_ax = 1:n_axis_plot
        if n_axis_plot > 1
            subplot(n_axis_plot, 1, k_ax)
        end
        
        hold on
        plot(time_true(1:n_step_plot:end), y_true(k_ax, 1:n_step_plot:end),'b');
        if k_ax == n_axis_plot
            xlabel('Time (s)');
        end
        if k_ax == 1
            % title('link position');
        end
        if enable_inverse_model
            ylabel(['\tau_',num2str(k_ax),' (Nm)']);
        else
            ylabel(['q_',num2str(k_ax),' (deg)']);
        end
        
        xlim([time_true(1), time_true(end)])
        
        % print command line metrics per axis
        y_step = y_true(k_ax, :);
        y_sim_step = y_sim(k_ax, :);
        nrmse_pos = sqrt( mean( (y_step - y_sim_step).^2 ) ) / std(y_step);
        r_squrad = 100 * (1 - ( sum((y_step - y_sim_step).^2) / sum((y_step - mean(y_sim_step)).^2) ));
        
        
        nrmse_pos_all_axis(k_ax, k1) = round(nrmse_pos, 3);
        r_squared_all_axis(k_ax, k1) = round(r_squrad, 3);
        
        if enable_inverse_model
            disp(['NRMSE torque error ',num2str(nrmse_pos), ' Nm, R2 index ',num2str(r_squrad),'% for axis ', num2str(k_ax),'.'])
        else
            disp(['NRMSE position error ',num2str(nrmse_pos), ', R2 index ',num2str(r_squrad),'% for axis ', num2str(k_ax),'.'])
        end
    end
    
    % print the input for all axis
    % plot raw training and test data
    figure;
    for k_ax = 1:n_axis_plot
        if n_axis_plot > 1
            subplot(n_axis_plot, 1, k_ax)
        end
        
        hold on
        plot(time_true(1:n_step_plot:end), u_true(k_ax, 1:n_step_plot:end),'k');
        if k_ax == n_axis_plot
            xlabel('Time (s)');
        end
        if enable_inverse_model
            
            ylabel(['q_',num2str(k_ax),' (deg)']);
        else
            ylabel(['\tau_',num2str(k_ax),' (Nm)']);
        end
        
        xlim([time_true(1), time_true(end)])
    end
    
    % print estimation only for test data
    if k1 == 2
        % compare measurement with estimation
        figure;
        for k_ax = 1:n_axis_plot
            if n_axis_plot > 1
                subplot(n_axis_plot, 1, k_ax)
            end
            hold on
            plot(time_true(1:n_step_plot:end), y_true(k_ax, 1:n_step_plot:end),'b');
            plot(time_true(1:n_step_plot:end), y_sim(k_ax, 1:n_step_plot:end), 'r');
            % legend('meas', 'sim')
            if k_ax == n_axis_plot
                xlabel('Time (s)');
            end
            if k_ax == 1
                % title('link position');
            end
            if enable_inverse_model
                ylabel(['\tau_',num2str(k_ax),' (Nm)']);
            else
                ylabel(['q_',num2str(k_ax),' (deg)']);
            end
            xlim([time_true(1), time_true(end)])
        end
    end
    
    % print command line average metrics
    % nrmse_pos = sqrt( mean( (y_step - y_sim_step).^2, 'all' ) ) / std(y_step);
    % r_squrad = 100 * (1 - ( sum((y_true - y_sim).^2, 'all') / sum((y_true - mean(y_sim)).^2, 'all') ));
    nrmse_pos = mean( nrmse_pos_all_axis(:, k1) );
    r_squrad = mean( r_squared_all_axis(:, k1) );
    
    if enable_inverse_model
        disp(['All axis NRMSE torque error ',num2str(nrmse_pos), ', R2 index ',num2str(r_squrad),'%.'])
    else
        disp(['All axis NRMSE position error ',num2str(nrmse_pos), ', R2 index ',num2str(r_squrad),'%.'])
    end
    
    
    
    
end

nrmse_pos_all_axis_mean_train = mean(nrmse_pos_all_axis(:, 1));
r_squared_all_axis_mean_train = mean(r_squared_all_axis(:, 1));
nrmse_pos_all_axis_mean_test = mean(nrmse_pos_all_axis(:, 2));
r_squared_all_axis_mean_test = mean(r_squared_all_axis(:, 2));

disp('Results in formatted latex table:')
disp('\toprule')
disp('Joint & \multicolumn{2}{l}{Training Data} & \multicolumn{2}{l}{Test Data}\\') 
disp('& NRMSE & R$^2$ & NRMSE & R$^2$ \\')
disp('& $\mathrm{deg}$ & \% & $\mathrm{deg}$ & \% \\')
for k_ax = 1:n_axis_plot
    if enable_inverse_model
        disp(['$\tau_',num2str(k_ax),'$ & ',num2str(nrmse_pos_all_axis(k_ax, 1)),' & ',num2str(r_squared_all_axis(k_ax, 1)),' & ',num2str(nrmse_pos_all_axis(k_ax, 2)),' & ',num2str(r_squared_all_axis(k_ax, 2)),'\\'])
    else
        disp(['$q_',num2str(k_ax),'$ & ',num2str(nrmse_pos_all_axis(k_ax, 1)),' & ',num2str(r_squared_all_axis(k_ax, 1)),' & ',num2str(nrmse_pos_all_axis(k_ax, 2)),' & ',num2str(r_squared_all_axis(k_ax, 2)),'\\'])
    end
end
disp('\midrule')
disp(['All Joints & ',num2str(nrmse_pos_all_axis_mean_train),' & ',num2str(r_squared_all_axis_mean_train),' & ',num2str(nrmse_pos_all_axis_mean_test),' & ',num2str(r_squared_all_axis_mean_test),'\\'])
disp('\bottomrule')


end