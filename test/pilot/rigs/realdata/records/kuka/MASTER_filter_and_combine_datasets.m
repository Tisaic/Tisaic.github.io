function MASTER_filter_and_combine_datasets

% Filter and combine the data sets for system identification

% Inputs: none
% Outputs: none
% Can run stand-alone.

% Jonas Weigand
% TU Kaiserslautern
% jonas.weigand@mv.uni-kl.de

%% settings

% note: one raw data set consistens of 6 trajectories.
% 3 trajectories in each data set are designed on a different
% reference trajectory and each is repeated twice.

% optionally plot raw data
plot_all_raw_data = false;

% add the raw data to the combined data files
save_raw_data_files = false;

n_step          = 25; % reduction of variables
dt_data         = 0.004; % sample time in the data set
dt              = dt_data * n_step; % reduced sample time

% get all mat-files in the subfolder
files                = dir('raw_data\*.mat');
n_datasets           = numel(files);

% by definition, apply the last data set for testing and all previous data
% sets for training
n_datasets_train     = n_datasets-1;
n_datasets_test      = n_datasets;

% apply the last data set for validation, everything else for training
list_datasets = {1:n_datasets_train, n_datasets_test};

% a low pass filter for torque and position signals
filter_design = designfilt('lowpassiir', 'FilterOrder', 4, ...
    'PassbandFrequency', 2, 'PassbandRipple', 0.2,...
    'SampleRate', 1/dt_data);

% define a laplace filter to estimate the derivatives
s = tf('s');
T = 5e-1;
filter_vel = s/(1 + T*s);
filter_acc = (s/(1 + T*s))^2;

% by definition, the first 3 axis are the main axis and the remaing 3 axis
% are hand axis.
main_axis = 1:3;
hand_axis = 4:6;

% save original runs as struct
original_runs = [];


%% filter and combine data
% for training and testing
for k1 = 1:2
    
    % initialize new, empty position and torque variables for training and
    % testing
    q = [];
    tau = [];
    
    if k1 == 1
        mode = 'train';
    else
        mode = 'test';
    end
    
    % for all data sets
    for k2 = list_datasets{k1}
        
        % load the data
        data_run = load([files(k2).folder,'\', files(k2).name]);
        
        % check if mat-files is ok
        if not(isfield(data_run, 'recording_ok'))
            warning(['Folder contains mat-files which do not contain correct measurements. ',...
                'Either remove these other mat-files from this folder or list mat-files with measurements explicitly.'])
            return
        end
        
        % change file name - delete .mat and add mode
        file_name_no_mat = strrep(files(k2).name,'.mat','');
        file_name_mode = [file_name_no_mat,'_',mode];
        
        % save original runs
        original_runs.(file_name_mode) = data_run;
        
        % convert to double
        % for position signals, use the secondary encoder for the main
        % axis, and the motor resolver signal for the hand axis
        q_se_meas         = double(data_run.q_se_meas(main_axis, :));
        q_mot_meas        = double(data_run.q_mot_meas(hand_axis, :));
        tau_single_run    = double(data_run.tau_meas);
        
        % combine data
        q_single_run        = [q_se_meas; q_mot_meas];
        
        % save run in position and torque variable
        q                   = [q, q_single_run]; %#ok
        tau                 = [tau, tau_single_run]; %#ok
        
        % optionally - plot single runs
        if plot_all_raw_data
            figure %#ok
            for k3 = 1:6
                subplot(6,1,k3)
                plot(tau_single_run(k3,:)')
            end
            figure
            for k3 = 1:6
                subplot(6,1,k3)
                plot(q_single_run(k3,:)')
            end
        end
        
    end
    
    % low pass filter all data
    tau  = filtfilt(filter_design, tau')';
    q    = filtfilt(filter_design, q')';
    
    % time shift for inverse data
    q_shifted       = [q(:, 2:end), q(:,end)];
    
    n_axis          = size(q_shifted, 1); % number of axis, 6
    nt              = size(q_shifted, 2); % number of time steps
    qd_shifted      = q_shifted; % initialize velocity signal
    qdd_shifted     = q_shifted; % initialize acceleration signal
    time            = linspace(0, (nt-1)*dt_data, nt); % time vector
    
    % for each axis, estimate the velocity and acceleration signal
    for k2 = 1:n_axis
        
        qd_shifted(k2,:)    = lsim(filter_vel, q_shifted(k2,:)', time')';
        qdd_shifted(k2,:)   = lsim(filter_acc, q_shifted(k2,:)', time')';
        
    end
    
    % low pass filter all data
    q_shifted      = filtfilt(filter_design, q_shifted')';
    qd_shifted     = filtfilt(filter_design, qd_shifted')';
    qdd_shifted    = filtfilt(filter_design, qdd_shifted')';
    
    % reduce number of time steps
    tau            = tau(:, 1:n_step:end);
    q              = q(:, 1:n_step:end);
    q_shifted      = q_shifted(:, 1:n_step:end);
    qd_shifted     = qd_shifted(:, 1:n_step:end);
    qdd_shifted    = qdd_shifted(:, 1:n_step:end);
    
    % create time vector
    nt_reduced = size(q, 2);
    time_reduced = linspace(0, nt_reduced*dt, nt_reduced);
    
    % check for warnings
    if any(isnan(q), 'all') || any(isnan(tau), 'all')
        warning('Values are NaN.')
    end
    if any(isinf(q), 'all') || any(isinf(tau), 'all')
        warning('Values are Inf.')
    end
    if any(isinf(q_shifted), 'all') || any(isnan(q_shifted), 'all')
        warning('Values are Inf or Nan.')
    end
    
    % prepare the save
    if k1 == 1
        
        u_train_forward = tau;
        y_train_forward = q;
        u_train_inverse = [q_shifted; qd_shifted; qdd_shifted];
        y_train_inverse = tau;
        time_train      = time_reduced;
        
    else
        u_test_forward = tau;
        y_test_forward = q;
        u_test_inverse = [q_shifted; qd_shifted; qdd_shifted];
        y_test_inverse = tau;
        time_test      = time_reduced;
        
    end
    
end


% get current time
DateString = datestr( datetime('now') );



%% save forward model
y_train     = y_train_forward;
u_train     = u_train_forward;
y_test      = y_test_forward;
u_test      = u_test_forward;


READ_ME = {'GENERAL INFORMATION:','';
    'Content:       ','This file contains recorded input and output measurements of the robot.';
    '               ','The data is split into training and test data.';
    '               ','The data is recorded in seperate runs, which are combined for the identification benchmark.';
    '               ','The data is filtered and the sample time is reduced compared to the original runs.';
    'Units:         ','Input is in Nm, output is in deg, time is in s.';
    'Author:        ','Jonas Weigand, Jonas Ulmen, Julian Götz, TU Kaiserslautern.';
    'Time:          ', DateString;
    'INFORMATION ON VARIABLES:','';
    'y_train:       ','Measured output, real axis positions for training in deg.';
    'u_train:       ','Measured input, motor torques for training in Nm.';
    'time_train:    ','Time vector corresponding to the input and output data for training in s.'
    'y_test:        ','Measured output, real axis positions for test in deg.';
    'u_test:        ','Measured input, motor torques for test in Nm.';
    'time_test:     ','Time vector corresponding to the input and output data for test in s.';
    'original_runs: ','Original runs with additional measurements (unfiltered, high sample rate, real axis velocities, feed forward torques, reference trajectory). DO NOT APPLY FOR IDENTIFICATION BENCHMARK FOR COMPARABILITY.'};

if save_raw_data_files
    save('forward_identification_with_raw_data.mat', 'READ_ME', 'y_train', 'u_train', 'time_train', 'y_test', 'u_test', 'time_test', 'original_runs') %#ok
end

save('forward_identification_without_raw_data.mat', 'READ_ME', 'y_train', 'u_train', 'time_train', 'y_test', 'u_test', 'time_test')



%% save inverse model
y_train     = y_train_inverse;
u_train     = u_train_inverse;
y_test      = y_test_inverse;
u_test      = u_test_inverse;


READ_ME = {'GENERAL INFORMATION:','';
    'Content:       ','This file contains recorded input and output measurements of the robot.';
    '               ','The data is split into training and test data.';
    '               ','The data is recorded in seperate runs, which are combined for the identification benchmark.';
    '               ','The data is filtered and the sample time is reduced compared to the original runs.';
    'Units:         ','Input is in deg, deg/s, deg/s^2, output is in Nm, time is in s.';
    'Author:        ','Jonas Weigand, Jonas Ulmen, Julian Götz, TU Kaiserslautern.';
    'Time:          ', DateString;
    'INFORMATION ON VARIABLES:','';
    'y_train:       ','Measured output, motor torques for training in Nm.';
    'u_train:       ','Measured input, real axis positions, velocities and acceleration for training in deg, deg/s, deg/s^2';
    'time_train:    ','Time vector corresponding to the input and output data for training in s.'
    'y_test:        ','Measured output, motor torques for training in Nm.';
    'u_test:        ','Measured input, real axis positions, velocities and acceleration for training in deg, deg/s, deg/s^2';
    'time_test:     ','Time vector corresponding to the input and output data for test in s.';
    'original_runs: ','Original runs with additional measurements (unfiltered, high sample rate, real axis velocities, feed forward torques, reference trajectory). DO NOT APPLY FOR IDENTIFICATION BENCHMARK FOR COMPARABILITY.'};

if save_raw_data_files
    save('inverse_identification_with_raw_data.mat', 'READ_ME', 'y_train', 'u_train', 'time_train', 'y_test', 'u_test', 'time_test', 'original_runs') %#ok
end

save('inverse_identification_without_raw_data.mat', 'READ_ME', 'y_train', 'u_train', 'time_train', 'y_test', 'u_test', 'time_test')

end